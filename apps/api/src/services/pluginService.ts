import { createHash } from 'node:crypto';
import {
  allowsMadoNamespace,
  isSameUuid,
  MADO_SCOPES,
  type PluginConnection,
  type PluginCreate,
  type PluginEvent,
  type PluginOutboxSummary,
  type PluginPatch,
} from '@mmt/contracts';
import { MadoApiError } from '@mmt/platform';
import type { Principal } from '../auth/principal.js';
import { first, transaction, type Database } from '../db/database.js';
import { conflict, DomainError, notFound } from '../domain/errors.js';
import { isPluginDeliveryStalled } from '../domain/operationsAlerts.js';
import { findPluginBacklog } from '../repositories/operationsAlertRepository.js';
import { builtinPlugins, type PluginClientFactory } from '../plugins/builtinPlugins.js';
import type { PluginConnectionRecord } from '../plugins/pluginConnection.js';
import type { SecretKey } from '../security/secretEncryption.js';
import { PluginConnections } from './pluginConnections.js';
import { importPluginDataset } from './pluginDatasetImport.js';
import { requireProject } from './accessService.js';
import type { RegistryService } from './registryService.js';

export type { PluginClientFactory } from '../plugins/builtinPlugins.js';
export interface PluginDeliveryPayload {
  event: PluginEvent;
  payload: string;
  payloadHash: string;
  destinationUrl: string;
}

/** Project authorization and domain operations of the application's compiled-in plugins. */
export class PluginService {
  private readonly database: Database;
  private readonly registry: RegistryService;
  private readonly connections: PluginConnections;
  private readonly clientFactory: PluginClientFactory;
  constructor(options: {
    database: Database;
    registry: RegistryService;
    secretKey?: SecretKey | null;
    clientFactory?: PluginClientFactory;
  }) {
    this.database = options.database;
    this.registry = options.registry;
    this.connections = new PluginConnections(options.database, options.secretKey ?? null);
    this.clientFactory = options.clientFactory ?? builtinPlugins.mado.createClient;
  }

  list(principal: Principal, projectId: string) {
    return this.connections.list(principal, projectId);
  }
  availability(principal: Principal, projectId: string) {
    return this.connections.availability(principal, projectId);
  }
  create(principal: Principal, projectId: string, input: PluginCreate) {
    return this.connections.create(principal, projectId, input);
  }
  patch(
    principal: Principal,
    projectId: string,
    request: { pluginId: string; input: PluginPatch },
  ) {
    return this.connections.patch(principal, projectId, request);
  }

  /** Reads the access token's grant from Mado and saves it with the manifest for this revision. */
  async check(
    principal: Principal,
    projectId: string,
    pluginId: string,
  ): Promise<PluginConnection> {
    const plugin = await this.connections.authorize(principal, {
      projectId,
      pluginId,
      allowDisabled: true,
    });
    const checked = await this.callPlugin(() => this.client(plugin).checkConnection());
    const saved = await first<PluginConnectionRecord>(
      this.database,
      `UPDATE plugin_connections SET manifest=$2::jsonb,access_token_grant=$3::jsonb
        WHERE id=$1 AND project_id=$4 AND config_revision=$5 RETURNING *`,
      [
        plugin.id,
        JSON.stringify(checked.manifest),
        JSON.stringify(checked.accessTokenGrant),
        projectId,
        plugin.configRevision,
      ],
    );
    if (!saved) conflict('the connection settings of the integration have changed; check them again');
    return this.connections.present(saved);
  }

  async search(
    principal: Principal,
    projectId: string,
    request: { pluginId: string; query: string; expectedRevision?: number },
  ) {
    const plugin = await this.connections.authorize(principal, {
      projectId,
      pluginId: request.pluginId,
    });
    await this.connections.assertRevision(plugin, request.expectedRevision);
    const datasets = await this.callPlugin(() => this.client(plugin).searchDatasets(request.query));
    await this.connections.assertRevision(plugin);
    return datasets;
  }

  async metrics(
    principal: Principal,
    projectId: string,
    pluginId: string,
  ): Promise<{ prometheus: string }> {
    const plugin = await this.connections.authorize(principal, { projectId, pluginId });
    if (!plugin.accessTokenGrant?.scopes.includes(MADO_SCOPES.metricsRead))
      throw new DomainError({
        status: 422,
        code: 'plugin_capability_unsupported',
        message: 'the access token does not allow reading capacity; check the connection again after allowing it',
      });
    const metrics = await this.callPlugin(() => this.client(plugin).metrics());
    await this.connections.assertRevision(plugin);
    return metrics;
  }

  async importDataset(
    principal: Principal,
    projectId: string,
    request: { pluginId: string; externalId: string; expectedRevision: number },
  ) {
    return transaction(this.database, async (connection) => {
      const plugin = await this.connections.authorize(
        principal,
        { projectId, pluginId: request.pluginId, lock: 'share' },
        connection,
      );
      if (plugin.configRevision !== request.expectedRevision)
        conflict('the integration settings have changed; search again');
      // The server resolves the immutable version itself; browser-supplied URI/digest are never trusted.
      const client = this.client(plugin);
      const imported = await this.callPlugin(() => client.datasetVersion(request.externalId));
      const grant = await this.callPlugin(() => client.accessTokenGrant());
      if (
        !isSameUuid(request.externalId, imported.externalId) ||
        !allowsMadoNamespace(grant, imported.namespace)
      )
        throw new DomainError({
          status: 422,
          code: 'plugin_dataset_identity_mismatch',
          message: 'the Mado version or namespace does not match',
        });
      return importPluginDataset(connection, this.registry, {
        projectId,
        pluginId: plugin.id,
        dataset: imported,
      });
    });
  }

  async retryEvents(
    principal: Principal,
    projectId: string,
    pluginId: string,
  ): Promise<{ queued: number }> {
    return transaction(this.database, async (connection) => {
      await this.connections.authorize(
        principal,
        { projectId, pluginId, lock: 'share' },
        connection,
      );
      const queued = await connection.query(
        "UPDATE plugin_outbox SET next_attempt_at=now(),last_error=NULL WHERE plugin_id=$1 AND status='pending' RETURNING id",
        [pluginId],
      );
      return { queued: queued.rowCount ?? 0 };
    });
  }

  async outboxSummary(
    principal: Principal,
    projectId: string,
    pluginId: string,
  ): Promise<PluginOutboxSummary> {
    await requireProject(this.database, principal, { projectId, role: 'admin', scope: 'admin' });
    const backlog = await findPluginBacklog(this.database, { projectId, pluginId });
    if (!backlog) notFound('integration');
    return {
      pending: backlog.pending,
      sending: backlog.sending,
      oldestPendingAt: backlog.oldestPendingAt,
      maxAttempts: backlog.maxAttempts,
      lastError: backlog.lastError,
      lastDeliveredAt: backlog.lastDeliveredAt,
      stalled: backlog.enabled && isPluginDeliveryStalled(backlog),
    };
  }

  client(plugin: PluginConnectionRecord) {
    const credentials = this.connections.credentials.read(plugin);
    if (!credentials.accessToken)
      throw new DomainError({
        status: 503,
        code: 'plugin_token_unavailable',
        message: 'the Mado access token is not set',
      });
    return this.clientFactory({ config: plugin.config, credentials, pluginId: plugin.id });
  }

  async sendDelivery(
    plugin: PluginConnectionRecord,
    delivery: PluginDeliveryPayload,
  ): Promise<void> {
    if (
      delivery.destinationUrl !== plugin.config?.lineageUrl ||
      createHash('sha256').update(delivery.payload).digest('hex') !== delivery.payloadHash
    )
      throw new DomainError({
        status: 409,
        code: 'plugin_delivery_identity_mismatch',
        message: 'the destination or content of the integration does not match',
      });
    await this.client(plugin).sendPayload(delivery.payload);
  }

  private async callPlugin<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (error instanceof MadoApiError && error.status === 404)
        throw new DomainError({
          status: 404,
          code: 'plugin_dataset_not_found',
          message: 'cannot get the Mado version',
        });
      throw new DomainError({
        status: 502,
        code: 'plugin_request_failed',
        message: 'failed to communicate with Mado',
      });
    }
  }
}
