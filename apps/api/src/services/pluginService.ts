import {
  MADO_SCOPES,
  type PluginConnection,
  type PluginCreate,
  type PluginPatch,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, type Database } from '../db/database.js';
import { conflict, DomainError } from '../domain/errors.js';
import { builtinPlugins, type PluginClientFactory } from '../plugins/builtinPlugins.js';
import type { PluginConnectionRecord } from '../plugins/pluginConnection.js';
import type { SecretKey } from '../security/secretEncryption.js';
import { PluginConnections } from './pluginConnections.js';

export type { PluginClientFactory } from '../plugins/builtinPlugins.js';

/** アプリに組み込まれたpluginの、Projectの権限確認とドメインの操作。 */
export class PluginService {
  private readonly database: Database;
  private readonly connections: PluginConnections;
  private readonly clientFactory: PluginClientFactory;
  constructor(options: {
    database: Database;
    secretKey?: SecretKey | null;
    clientFactory?: PluginClientFactory;
  }) {
    this.database = options.database;
    this.connections = new PluginConnections(options.database, options.secretKey ?? null);
    this.clientFactory = options.clientFactory ?? builtinPlugins.mado.createClient;
  }

  list(principal: Principal, projectId: string) {
    return this.connections.list(principal, projectId);
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

  /**
   * access tokenのgrantをmado S3 Data Catalogから読み、このrevisionのmanifestと一緒に保存する。
   */
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

  private client(plugin: PluginConnectionRecord) {
    const credentials = this.connections.credentials.read(plugin);
    if (!credentials.accessToken)
      throw new DomainError({
        status: 503,
        code: 'plugin_token_unavailable',
        message: 'the Mado access token is not set',
      });
    return this.clientFactory({ config: plugin.config, credentials });
  }

  private async callPlugin<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError({
        status: 502,
        code: 'plugin_request_failed',
        message: 'failed to communicate with Mado',
      });
    }
  }
}
