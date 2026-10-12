import { randomUUID } from 'node:crypto';
import type {
  PluginAvailability,
  PluginConnection,
  PluginCreate,
  PluginPatch,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, rows, transaction, type Connection, type Database } from '../db/database.js';
import { conflict, DomainError, notFound } from '../domain/errors.js';
import { PluginCredentials } from '../security/pluginCredentials.js';
import type { SecretKey } from '../security/secretEncryption.js';
import type { PluginConnectionRecord } from '../plugins/pluginConnection.js';
import { requireGlobalAdmin, requireProject } from './accessService.js';
import { pinLegacyPluginEvents } from './pluginEventMigration.js';

export class PluginConnections {
  readonly credentials: PluginCredentials;
  constructor(
    private readonly database: Database,
    secretKey: SecretKey | null,
  ) {
    this.credentials = new PluginCredentials(secretKey);
  }

  async list(principal: Principal, projectId: string): Promise<PluginConnection[]> {
    await requireProject(this.database, principal, { projectId, role: 'admin', scope: 'admin' });
    return (await this.records(projectId)).map((plugin) => this.present(plugin));
  }

  async availability(principal: Principal, projectId: string): Promise<PluginAvailability[]> {
    const role = await requireProject(this.database, principal, {
      projectId,
      role: 'viewer',
      scope: 'read',
    });
    const canManage =
      role === 'admin' &&
      (principal.method === 'session' || principal.token?.scopes.includes('admin') === true);
    const records = (await this.records(projectId)).filter((plugin) => plugin.kind === 'mado');
    if (!records.length)
      return [
        {
          kind: 'mado',
          id: null,
          enabled: false,
          configured: false,
          configRevision: 0,
          webUrl: null,
          canImport: false,
        },
      ];
    return records.map((plugin) => {
      const configured = Boolean(
        plugin.config &&
          !plugin.migrationPending &&
          this.credentials.hasRequiredCredentials(plugin),
      );
      return {
        kind: 'mado',
        id: plugin.id,
        enabled: plugin.enabled,
        configured,
        configRevision: plugin.configRevision,
        webUrl: plugin.config?.webUrl ?? null,
        canImport: canManage && configured && plugin.enabled,
      };
    });
  }

  async create(
    principal: Principal,
    projectId: string,
    input: PluginCreate,
  ): Promise<PluginConnection> {
    requireGlobalAdmin(principal);
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, { projectId, role: 'admin', scope: 'admin' });
      const id = randomUUID();
      const secrets = this.credentials.prepare(
        {
          id,
          secretKeyId: null,
          encryptedCredentials: null,
          credentialsConfigured: { readToken: false, lineageToken: false, metricsToken: false },
        },
        input.credentials,
      );
      if (
        input.enabled &&
        (!secrets.credentialsConfigured.readToken || !secrets.credentialsConfigured.lineageToken)
      )
        throw new DomainError(
          422,
          '参照用と送信用のキーを設定してから有効にしてください',
          'plugin_credentials_required',
        );
      const plugin = (await first<PluginConnectionRecord>(
        connection,
        `INSERT INTO plugin_connections(id,project_id,name,kind,config,config_revision,secret_key_id,encrypted_credentials,credentials_configured,enabled)
         VALUES($1,$2,$3,'mado',$4::jsonb,1,$5,$6,$7::jsonb,$8) RETURNING *`,
        [
          id,
          projectId,
          input.name ?? 'Mado',
          JSON.stringify(input.config),
          secrets.secretKeyId,
          secrets.encryptedCredentials,
          JSON.stringify(secrets.credentialsConfigured),
          input.enabled ?? false,
        ],
      ))!;
      return this.present(plugin);
    });
  }

  async patch(
    principal: Principal,
    projectId: string,
    request: { pluginId: string; input: PluginPatch },
  ): Promise<PluginConnection> {
    requireGlobalAdmin(principal);
    return transaction(this.database, async (connection) => {
      const plugin = await this.authorize(
        principal,
        {
          projectId,
          pluginId: request.pluginId,
          lock: 'update',
          allowDisabled: true,
          allowUnconfigured: true,
        },
        connection,
      );
      const { input } = request;
      if (input.expectedRevision !== undefined && input.expectedRevision !== plugin.configRevision)
        conflict('連携設定が変更されています。更新してから保存してください');
      if (plugin.kind === 'legacy' && (input.config || input.credentials || input.enabled === true))
        throw new DomainError(
          422,
          'この旧Pluginは内蔵連携に対応していません。無効化して記録を保持できます',
          'plugin_kind_unsupported',
        );
      const config = input.config ?? plugin.config;
      if (input.config && plugin.config)
        await this.assertInstanceUnchanged(connection, plugin, input.config);
      const secrets = this.credentials.prepare(plugin, input.credentials);
      const updated = {
        ...plugin,
        ...secrets,
        config,
        name: input.name ?? plugin.name,
        enabled: input.enabled ?? plugin.enabled,
        configRevision: plugin.configRevision + 1,
        manifest: input.config || input.credentials ? null : plugin.manifest,
      };
      if (updated.enabled && updated.config && !this.credentials.hasRequiredCredentials(updated))
        throw new DomainError(
          422,
          '参照用と送信用のキーを設定してから有効にしてください',
          'plugin_credentials_required',
        );
      const saved = (await first<PluginConnectionRecord>(
        connection,
        `UPDATE plugin_connections SET name=$2,config=$3::jsonb,config_revision=$4,secret_key_id=$5,encrypted_credentials=$6,
          credentials_configured=$7::jsonb,enabled=$8,manifest=$9::jsonb WHERE id=$1 RETURNING *`,
        [
          plugin.id,
          updated.name,
          config ? JSON.stringify(config) : null,
          updated.configRevision,
          secrets.secretKeyId,
          secrets.encryptedCredentials,
          JSON.stringify(secrets.credentialsConfigured),
          updated.enabled,
          updated.manifest ? JSON.stringify(updated.manifest) : null,
        ],
      ))!;
      // Migration resolves the bridge's real destination without replacing its UUID or event IDs.
      if (plugin.kind === 'mado' && !plugin.config && saved.config)
        await pinLegacyPluginEvents(connection, saved);
      return this.present(saved);
    });
  }

  async authorize(
    principal: Principal,
    reference: {
      projectId: string;
      pluginId: string;
      lock?: 'share' | 'update';
      allowDisabled?: boolean;
      allowUnconfigured?: boolean;
      allowMigration?: boolean;
    },
    connection: Connection = this.database,
  ): Promise<PluginConnectionRecord> {
    await requireProject(connection, principal, {
      projectId: reference.projectId,
      role: 'admin',
      scope: 'admin',
    });
    const plugin = await first<PluginConnectionRecord>(
      connection,
      `SELECT * FROM plugin_connections WHERE project_id=$1 AND id=$2 ${reference.lock ? `FOR ${reference.lock.toUpperCase()}` : ''}`,
      [reference.projectId, reference.pluginId],
    );
    if (!plugin) notFound('連携');
    if (reference.allowUnconfigured) return plugin;
    if (plugin.kind !== 'mado')
      throw new DomainError(
        422,
        'この旧Pluginは内蔵連携に対応していません',
        'plugin_kind_unsupported',
      );
    if (plugin.migrationPending && !reference.allowMigration)
      throw new DomainError(422, 'Mado連携の移行確認が必要です', 'plugin_migration_required');
    if (!plugin.config)
      throw new DomainError(422, 'Mado連携の移行設定が必要です', 'plugin_migration_required');
    if (!reference.allowDisabled && !plugin.enabled)
      throw new DomainError(422, '連携は無効です', 'plugin_disabled');
    return plugin;
  }

  present(plugin: PluginConnectionRecord): PluginConnection {
    return {
      id: plugin.id,
      projectId: plugin.projectId,
      name: plugin.name,
      kind: plugin.kind,
      configurationStatus:
        plugin.kind === 'legacy'
          ? 'unsupported'
          : plugin.config && !plugin.migrationPending
            ? 'ready'
            : 'migration_pending',
      config: plugin.config,
      configRevision: plugin.configRevision,
      credentialsConfigured: plugin.credentialsConfigured,
      secretStorageAvailable: this.credentials.available,
      tokenConfigured: this.credentials.hasRequiredCredentials(plugin),
      baseUrl: plugin.baseUrl,
      tokenEnv: plugin.tokenEnv,
      enabled: plugin.enabled,
      manifest: plugin.manifest,
      createdAt: plugin.createdAt,
    };
  }

  async assertRevision(plugin: PluginConnectionRecord, expectedRevision?: number): Promise<void> {
    if (expectedRevision !== undefined && expectedRevision !== plugin.configRevision)
      conflict('連携設定が変更されています。再確認してください');
    const current = await first<{ configRevision: number }>(
      this.database,
      'SELECT config_revision FROM plugin_connections WHERE id=$1',
      [plugin.id],
    );
    if (!current || current.configRevision !== plugin.configRevision)
      conflict('連携設定が変更されています。再確認してください');
  }

  private records(projectId: string) {
    return rows<PluginConnectionRecord>(
      this.database,
      'SELECT * FROM plugin_connections WHERE project_id=$1 ORDER BY created_at DESC',
      [projectId],
    );
  }

  private async assertInstanceUnchanged(
    connection: Connection,
    plugin: PluginConnectionRecord,
    config: NonNullable<PluginConnectionRecord['config']>,
  ): Promise<void> {
    if (
      (['apiUrl', 'webUrl', 'lineageUrl'] as const).every(
        (key) => plugin.config![key] === config[key],
      )
    )
      return;
    const history = await first<{ exists: boolean }>(
      connection,
      `SELECT EXISTS(SELECT 1 FROM plugin_outbox WHERE plugin_id=$1)
        OR EXISTS(SELECT 1 FROM dataset_versions WHERE lower(external_ref->>'pluginId')=lower($1::text)) AS exists`,
      [plugin.id],
    );
    if (history?.exists)
      conflict(
        'この連携には既存のバージョンまたは送信記録があります。別のMadoには新しい連携を設定してください',
      );
  }
}
