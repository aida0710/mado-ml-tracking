import { createHash } from 'node:crypto';
import type {
  PluginCreate,
  PluginEvent,
  PluginManifest,
  PluginOutboxSummary,
  PluginPatch,
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
import { importPluginDeliveryReceipts } from './pluginEventMigration.js';
import { requireGlobalAdmin, requireProject } from './accessService.js';
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

  async check(principal: Principal, projectId: string, pluginId: string): Promise<PluginManifest> {
    const plugin = await this.connections.authorize(principal, {
      projectId,
      pluginId,
      allowDisabled: true,
      allowMigration: true,
    });
    const manifest = await this.callPlugin(() => this.client(plugin).manifest());
    const saved = await first(
      this.database,
      'UPDATE plugin_connections SET manifest=$2::jsonb WHERE id=$1 AND project_id=$3 AND config_revision=$4 RETURNING id',
      [plugin.id, JSON.stringify(manifest), projectId, plugin.configRevision],
    );
    if (!saved) conflict('連携の接続設定が変更されています。再確認してください');
    return manifest;
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
    if (!plugin.credentialsConfigured.metricsToken)
      throw new DomainError(422, '容量取得用のキーは未設定です', 'plugin_capability_unsupported');
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
        conflict('連携設定が変更されています。検索し直してください');
      // The server resolves the immutable version itself; browser-supplied URI/digest are never trusted.
      const imported = await this.callPlugin(() =>
        this.client(plugin).datasetVersion(request.externalId),
      );
      if (
        imported.externalId !== request.externalId ||
        !plugin.config!.namespaces.includes(imported.namespace)
      )
        throw new DomainError(
          422,
          'MadoのバージョンまたはNamespaceが一致しません',
          'plugin_dataset_identity_mismatch',
        );
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

  async completeMigration(
    principal: Principal,
    projectId: string,
    request: { pluginId: string; expectedRevision: number },
  ) {
    requireGlobalAdmin(principal);
    return transaction(this.database, async (connection) => {
      const plugin = await this.connections.authorize(
        principal,
        {
          projectId,
          pluginId: request.pluginId,
          lock: 'update',
          allowDisabled: true,
          allowMigration: true,
        },
        connection,
      );
      if (plugin.configRevision !== request.expectedRevision)
        conflict('連携設定が変更されています');
      if (!plugin.migrationPending) return this.connections.present(plugin);
      if (!plugin.manifest || !this.connections.credentials.hasRequiredCredentials(plugin))
        throw new DomainError(
          422,
          '接続キーを設定し、接続確認を完了してから移行してください',
          'plugin_migration_check_required',
        );
      const migrated = (await first<PluginConnectionRecord>(
        connection,
        'UPDATE plugin_connections SET migration_pending=false,config_revision=config_revision+1 WHERE id=$1 RETURNING *',
        [plugin.id],
      ))!;
      return this.connections.present(migrated);
    });
  }

  async importReceipts(
    principal: Principal,
    projectId: string,
    request: { pluginId: string; receipts: { eventId: string; payloadHash: string }[] },
  ) {
    requireGlobalAdmin(principal);
    return transaction(this.database, async (connection) => {
      await this.connections.authorize(
        principal,
        {
          projectId,
          pluginId: request.pluginId,
          lock: 'share',
          allowDisabled: true,
          allowMigration: true,
        },
        connection,
      );
      return importPluginDeliveryReceipts(connection, request);
    });
  }

  async outboxSummary(
    principal: Principal,
    projectId: string,
    pluginId: string,
  ): Promise<PluginOutboxSummary> {
    await requireProject(this.database, principal, { projectId, role: 'admin', scope: 'admin' });
    const backlog = await findPluginBacklog(this.database, { projectId, pluginId });
    if (!backlog) notFound('連携');
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

  client(
    plugin: PluginConnectionRecord,
    requiredCredential: 'readToken' | 'lineageToken' = 'readToken',
  ) {
    if (plugin.kind !== 'mado' || !plugin.config)
      throw new DomainError(422, 'Mado連携の設定が必要です', 'plugin_migration_required');
    const credentials = this.connections.credentials.read(plugin);
    if (!credentials[requiredCredential])
      throw new DomainError(503, '必要なMado接続キーが未設定です', 'plugin_token_unavailable');
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
      throw new DomainError(
        409,
        '連携の送信先または内容が一致しません',
        'plugin_delivery_identity_mismatch',
      );
    await this.client(plugin, 'lineageToken').sendPayload(delivery.payload);
  }

  private async callPlugin<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (error instanceof MadoApiError && error.status === 404)
        throw new DomainError(404, 'Madoのバージョンを参照できません', 'plugin_dataset_not_found');
      throw new DomainError(502, 'Madoとの通信に失敗しました', 'plugin_request_failed');
    }
  }
}
