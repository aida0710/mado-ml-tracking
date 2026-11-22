import {
  DATA_CATALOG_SCOPES,
  type DataCatalogAccessTokenGrant,
  type DataCatalogConnectionInput,
  type DataCatalogPlugin,
  type DataCatalogReference,
  type DataCatalogStorageConnection,
  parseS3Uri,
} from '@mmt/contracts';
import {
  createDataCatalogClient,
  DataCatalogApiError,
  type DataCatalogClient,
} from '@mmt/platform';
import type { Principal } from '../auth/principal.js';
import { transaction, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  deleteDataCatalogConnection,
  findDataCatalogConnection,
  replaceDataCatalogStorageConnections,
  saveDataCatalogConnection,
  type DataCatalogConnectionRow,
} from '../repositories/dataCatalogConnectionRepository.js';
import { decryptSecret, encryptSecret, type SecretKey } from '../security/secretEncryption.js';
import { requireGlobalAdmin, requireProject } from './accessService.js';
import {
  auditActor,
  NO_REQUEST_METADATA,
  recordDenial,
  type AuditEventDraft,
} from './auditService.js';

export type DataCatalogClientFactory = (connection: {
  url: string;
  accessToken: string;
}) => DataCatalogClient;

// access tokenの暗号文を、この用途にだけ結び付ける。接続は全体で1つなので、行ごとの区別は要らない。
const ACCESS_TOKEN_SECRET_CONTEXT = 'data-catalog-connection';
const UNAUTHENTICATED_STATUSES: ReadonlySet<number> = new Set([401, 403]);

/**
 * 全体で1つの、mado S3 Data Catalogへの接続。設定は全体管理者だけが扱う。保存するのは接続を
 * 確かめられたものだけなので、「保存したが使えない」状態は残らない。
 */
export class DataCatalogConnectionService {
  private readonly database: Database;
  private readonly secretKey: SecretKey | null;
  private readonly clientFactory: DataCatalogClientFactory;
  constructor(options: {
    database: Database;
    secretKey: SecretKey | null;
    clientFactory?: DataCatalogClientFactory;
  }) {
    this.database = options.database;
    this.secretKey = options.secretKey;
    this.clientFactory = options.clientFactory ?? createDataCatalogClient;
  }

  async get(principal: Principal): Promise<DataCatalogPlugin> {
    requireGlobalAdmin(principal);
    return this.present(await findDataCatalogConnection(this.database));
  }

  /**
   * mado S3 Data Catalogに接続を確かめ、通ったら保存する。access tokenを省いたときは、
   * 同じURLの保存済みのtokenで確かめ直す（権限や期限を変えたあとの読み直し）。
   */
  async connect(
    principal: Principal,
    input: DataCatalogConnectionInput,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<DataCatalogPlugin> {
    const draft = this.auditDraft(principal, request, 'plugin.data_catalog.connect');
    return recordDenial(this.database, draft, async () => {
      requireGlobalAdmin(principal);
      const secretKey = this.requireSecretKey();
      const accessToken =
        input.accessToken ??
        this.savedAccessTokenFor(await findDataCatalogConnection(this.database), input.url);
      const client = this.clientFactory({ url: input.url, accessToken });
      const accessTokenGrant = await this.readAccessTokenGrant(client);
      const storageConnections = await this.readStorageConnections(client);
      // 容量を読める権限があるなら、実際に読めることまで確かめる。
      if (canReadCapacity(accessTokenGrant))
        await this.callDataCatalog(() => client.capacityMetrics());
      const encrypted = encryptSecret({
        key: secretKey,
        plaintext: accessToken,
        context: ACCESS_TOKEN_SECRET_CONTEXT,
      });
      const saved = await transaction(this.database, async (connection) => {
        const row = await saveDataCatalogConnection(connection, {
          url: input.url,
          secretKeyId: encrypted.keyId,
          encryptedAccessToken: encrypted.payload,
          accessTokenGrant,
          storageConnections,
        });
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: {
            url: row.url,
            accessTokenName: accessTokenGrant.name,
            scopes: accessTokenGrant.scopes,
            accessTokenReplaced: input.accessToken !== undefined,
          },
        });
        return row;
      });
      return this.present(saved);
    });
  }

  async disconnect(
    principal: Principal,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<void> {
    const draft = this.auditDraft(principal, request, 'plugin.data_catalog.disconnect');
    await recordDenial(this.database, draft, async () => {
      requireGlobalAdmin(principal);
      await transaction(this.database, async (connection) => {
        const removed = await deleteDataCatalogConnection(connection);
        if (!removed) notFound('mado S3 Data Catalog connection');
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { url: removed.url },
        });
      });
    });
  }

  /** mado S3 Data Catalogが測った容量。Prometheusのテキスト形式のまま返す。 */
  async capacity(principal: Principal): Promise<{ prometheus: string }> {
    requireGlobalAdmin(principal);
    const saved = await findDataCatalogConnection(this.database);
    if (!saved) notFound('mado S3 Data Catalog connection');
    if (!canReadCapacity(saved.accessTokenGrant))
      throw new DomainError({
        status: 422,
        code: 'data_catalog_capacity_not_permitted',
        message:
          'the access token does not allow reading capacity; allow it in mado S3 Data Catalog and check the connection again',
      });
    const client = this.savedClient(saved);
    return { prometheus: await this.callDataCatalog(() => client.capacityMetrics()) };
  }

  /**
   * Projectを読める人に見せる内容。画面のURLとストレージ接続の名前だけで、access tokenの権限と
   * 容量は含めない。
   */
  async reference(principal: Principal, projectId: string): Promise<DataCatalogReference> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    const saved = await findDataCatalogConnection(this.database);
    return { url: saved?.url ?? null, storageConnections: saved?.storageConnections ?? [] };
  }

  /**
   * バージョンに付けるストレージ接続の指定を確かめる（登録と、あとからの付け替えの両方）。指定は
   * 任意で、無ければnullのまま通す。指定できるのは、接続済みで`uri`が`s3://`のときだけ。一覧に
   * 無いIDは受け付けない。保存してよいID（指定が無ければnull）を返す。
   */
  async resolveStorageConnectionId(registration: {
    uri: string | null | undefined;
    storageConnectionId: string | null | undefined;
  }): Promise<string | null> {
    const { storageConnectionId } = registration;
    // 指定の無い登録が大半。そのときは接続を読まずに済ませる。
    if (!storageConnectionId) return null;
    const saved = await findDataCatalogConnection(this.database);
    const isS3Uri = !!registration.uri && parseS3Uri(registration.uri) !== null;
    if (!saved || !isS3Uri)
      throw new DomainError({
        status: 422,
        code: 'data_catalog_storage_connection_not_applicable',
        message: saved
          ? 'dataCatalogStorageConnectionId applies only to an s3:// URI'
          : 'dataCatalogStorageConnectionId cannot be set because this site is not connected to mado S3 Data Catalog',
      });
    const isKnown = (storageConnections: DataCatalogStorageConnection[]) =>
      storageConnections.some((storageConnection) => storageConnection.id === storageConnectionId);
    // 接続を確かめたあとにmado S3 Data Catalogで足されたストレージ接続かもしれない。知らないIDの
    // ときだけ読み直す。
    if (isKnown(saved.storageConnections) || isKnown(await this.reloadStorageConnections(saved)))
      return storageConnectionId;
    throw new DomainError({
      status: 422,
      code: 'data_catalog_storage_connection_unknown',
      message:
        'dataCatalogStorageConnectionId is not a storage connection the mado S3 Data Catalog access token allows (GET /api/projects/{projectId}/data-catalog lists them)',
    });
  }

  // 読み直せなければ、覚えている一覧のままにする。登録の成否をmado S3 Data Catalogの稼働に
  // 左右させない。
  private async reloadStorageConnections(
    saved: DataCatalogConnectionRow,
  ): Promise<DataCatalogStorageConnection[]> {
    try {
      const storageConnections = await this.savedClient(saved).storageConnections();
      await replaceDataCatalogStorageConnections(this.database, storageConnections);
      return storageConnections;
    } catch {
      return saved.storageConnections;
    }
  }

  private savedClient(saved: DataCatalogConnectionRow): DataCatalogClient {
    return this.clientFactory({ url: saved.url, accessToken: this.decryptAccessToken(saved) });
  }

  private present(saved: DataCatalogConnectionRow | undefined): DataCatalogPlugin {
    return {
      connection: saved
        ? {
            url: saved.url,
            accessTokenGrant: saved.accessTokenGrant,
            storageConnections: saved.storageConnections,
            checkedAt: saved.checkedAt,
          }
        : null,
      secretStorageAvailable: this.secretKey !== null,
    };
  }

  private requireSecretKey(): SecretKey {
    if (!this.secretKey)
      throw new DomainError({
        status: 503,
        code: 'data_catalog_secret_key_unavailable',
        message: 'set MMT_PLUGIN_SECRET_KEY on the API server to store the access token',
      });
    return this.secretKey;
  }

  // 保存済みのtokenを送ってよいのは、それを確かめた相手と同じURLにだけ。
  private savedAccessTokenFor(saved: DataCatalogConnectionRow | undefined, url: string): string {
    if (!saved || saved.url !== url)
      throw new DomainError({
        status: 422,
        code: 'data_catalog_access_token_required',
        message: 'enter the access token of this mado S3 Data Catalog',
      });
    return this.decryptAccessToken(saved);
  }

  private decryptAccessToken(saved: DataCatalogConnectionRow): string {
    try {
      return decryptSecret({
        key: this.requireSecretKey(),
        context: ACCESS_TOKEN_SECRET_CONTEXT,
        encrypted: { keyId: saved.secretKeyId, payload: saved.encryptedAccessToken },
      });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError({
        status: 503,
        code: 'data_catalog_secret_decryption_failed',
        message:
          'the stored access token cannot be decrypted; check MMT_PLUGIN_SECRET_KEY or enter the access token again',
      });
    }
  }

  private async readAccessTokenGrant(
    client: DataCatalogClient,
  ): Promise<DataCatalogAccessTokenGrant> {
    try {
      return await this.callDataCatalog(() => client.accessTokenGrant());
    } catch (error) {
      // 届いたのにこのAPIが無いのは、URLがmado S3 Data Catalogのものでないとき。
      if (error instanceof DataCatalogApiError && error.status === 404)
        throw new DomainError({
          status: 502,
          code: 'data_catalog_access_token_unsupported',
          message:
            'no mado S3 Data Catalog API was found at this URL (/api/mado/access-token); check the URL',
        });
      throw error;
    }
  }

  // ストレージ接続を読めない接続は保存しない。保存すると、`s3://`にストレージ接続を付けられない
  // サイトになる。
  private async readStorageConnections(
    client: DataCatalogClient,
  ): Promise<DataCatalogStorageConnection[]> {
    try {
      return await this.callDataCatalog(() => client.storageConnections());
    } catch (error) {
      if (error instanceof DataCatalogApiError && error.status === 404)
        throw new DomainError({
          status: 502,
          code: 'data_catalog_storage_connections_unsupported',
          message:
            'this mado S3 Data Catalog cannot list connections (/api/mado/connections); update it to v0.6.1 or later',
        });
      throw error;
    }
  }

  /** 相手が返した失敗を、利用者が直せる理由に分ける。404は呼び出し側が意味を決める。 */
  private async callDataCatalog<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof DataCatalogApiError) || error.status === 404) throw error;
      if (UNAUTHENTICATED_STATUSES.has(error.status))
        throw new DomainError({
          status: 422,
          code: 'data_catalog_access_token_rejected',
          message:
            'mado S3 Data Catalog rejected the access token; check that it is correct and has not expired',
        });
      throw new DomainError({
        status: 502,
        code: 'data_catalog_request_failed',
        message: 'failed to communicate with mado S3 Data Catalog; check the URL',
      });
    }
  }

  private auditDraft(
    principal: Principal,
    request: RequestMetadata,
    action: string,
  ): AuditEventDraft {
    return {
      ...auditActor(principal),
      ...request,
      action,
      resourceType: 'plugin',
      resourceId: 'data-catalog',
      details: {},
    };
  }
}

function canReadCapacity(grant: DataCatalogAccessTokenGrant): boolean {
  return grant.scopes.includes(DATA_CATALOG_SCOPES.metricsRead);
}
