import type { ArtifactBackend } from '@mmt/contracts';
import {
  ArtifactBackendDisabledError,
  createArtifactStoreFromConfig,
  createReplaceableArtifactStores,
  type ArtifactContent,
  type ArtifactMultipartStore,
  type ArtifactRead,
  type ArtifactStore,
  type ArtifactStores,
  type ArtifactWrite,
  type ReplaceableArtifactStores,
  type StoredArtifact,
} from '@mmt/platform';
import type { Connection, Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import {
  listStorageBackendRows,
  readDefaultBackend,
  type StorageBackendRow,
} from '../repositories/storageBackendRepository.js';
import { decryptSecret, type SecretKey } from '../security/secretEncryption.js';

// 設定が保存されていなければ、新しいProjectは環境変数で決まるfilesystemの保存先を使い続ける。
export const FALLBACK_DEFAULT_BACKEND = 'filesystem';

/** 暗号化した秘密を、その保存先の行に結び付ける関連データ。 */
export function storageSecretContext(backend: string): string {
  return `storage-backend:${backend}`;
}

export type StorageBackendUnavailableReason = 'secret_key_missing' | 'secret_unreadable';
/** DBで設定した保存先のうち、設定した鍵で秘密を復号できないもの。 */
export class StorageBackendUnavailableError extends Error {
  constructor(readonly reason: StorageBackendUnavailableReason) {
    super(`Storage backend is unavailable: ${reason}`);
    this.name = 'StorageBackendUnavailableError';
  }
}

/**
 * ArtifactのサービスはDomainErrorをそのまま通すので、無効な保存先はクライアントに409として届く。
 */
async function translateDisabled<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ArtifactBackendDisabledError)
      throw new DomainError({
        status: 409,
        code: 'storage_backend_disabled',
        message: 'this storage backend is disabled and cannot store new artifacts',
      });
    throw error;
  }
}

/** 環境変数で決まる保存先の1つを単独のstoreに見せ、差し替えのできる対応表に入るようにする。 */
function environmentStore(stores: ArtifactStores, backend: ArtifactBackend): ArtifactStore {
  const multipart = stores.multipart(backend);
  return {
    put: (write) => stores.put({ ...write, backend }),
    read: (read) => stores.read({ ...read, backend }),
    remove: (key) => stores.remove({ backend, key }),
    ...(multipart ? { multipart } : {}),
  };
}

/**
 * アプリが使うArtifactStores。環境変数で決まる保存先と、DBで設定した保存先からなる。
 * DBの保存先は起動時に1回読み込み、このプロセスで管理者が変更するたびに差し替える。ほかの
 * APIのプロセスは、次に知らない保存先の名前に出会ったときに変更を知る。
 */
export class ArtifactStoreRegistry implements ArtifactStores {
  private readonly stores: ReplaceableArtifactStores;
  private readonly environmentBackends: ReadonlySet<ArtifactBackend>;
  private readonly appliedRevisions = new Map<ArtifactBackend, number>();
  private loading: Promise<void> | null = null;

  constructor(
    private readonly options: {
      database: Database;
      environmentStores: ArtifactStores;
      secretKey: SecretKey | null;
    },
  ) {
    const environmentBackends = options.environmentStores.backends();
    this.environmentBackends = new Set(environmentBackends);
    this.stores = createReplaceableArtifactStores(
      Object.fromEntries(
        environmentBackends.map((backend) => [
          backend,
          { store: environmentStore(options.environmentStores, backend), acceptsWrites: true },
        ]),
      ),
    );
  }

  isEnvironmentBackend(backend: ArtifactBackend): boolean {
    return this.environmentBackends.has(backend);
  }

  backends(): ArtifactBackend[] {
    return this.stores.backends();
  }

  /** Projectが選べる保存先。設定済みで、無効にされていないもの。 */
  writableBackends(): ArtifactBackend[] {
    return this.stores.writableBackends();
  }

  async put(write: ArtifactWrite): Promise<StoredArtifact> {
    await this.ensureLoaded();
    return translateDisabled(() => this.stores.put(write));
  }

  async read(read: ArtifactRead): Promise<ArtifactContent> {
    await this.ensureLoaded();
    if (!this.stores.backends().includes(read.backend)) await this.reload();
    return this.stores.read(read);
  }

  async remove(reference: { backend: ArtifactBackend; key: string }): Promise<void> {
    await this.ensureLoaded();
    // garbage collectorは、ほかのAPIのプロセスが足したかもしれない保存先のblobも消す。
    if (!this.stores.backends().includes(reference.backend)) await this.reload();
    return this.stores.remove(reference);
  }

  multipart(backend: ArtifactBackend): ArtifactMultipartStore | null {
    const multipart = this.stores.multipart(backend);
    if (!multipart) return null;
    return {
      ...multipart,
      createMultipart: (target) => translateDisabled(() => multipart.createMultipart(target)),
    };
  }

  /** 設定が無いか、設定した保存先が書き込みを受け付けなくなったときは'filesystem'を使う。 */
  async getDefaultBackend(connection: Connection = this.options.database): Promise<string> {
    const stored = await readDefaultBackend(connection);
    return stored && this.writableBackends().includes(stored) ? stored : FALLBACK_DEFAULT_BACKEND;
  }

  /**
   * DBの保存先を1回だけ読み込む。失敗したら（migrationを実行する前など）ログに残し、次に
   * 呼ばれたときに再試行する。その間も環境変数で決まる保存先は動き続ける。
   */
  ensureLoaded(): Promise<void> {
    this.loading ??= this.reload().catch((error: unknown) => {
      this.loading = null;
      console.error(
        JSON.stringify({ event: 'storage_backends_load_failed', name: (error as Error).name }),
      );
    });
    return this.loading;
  }

  /** DBの保存先をすべて読み直し、変わったものは差し替え、無くなった行のものは外す。 */
  async reload(): Promise<void> {
    const backendRows = await listStorageBackendRows(this.options.database);
    const present = new Set(backendRows.map((row) => row.name));
    for (const backend of this.appliedRevisions.keys()) {
      if (present.has(backend)) continue;
      this.stores.delete(backend);
      this.appliedRevisions.delete(backend);
    }
    for (const row of backendRows) this.apply(row);
  }

  /**
   * より新しいrevisionを既に適用していなければ、行から作ったstoreに差し替える。前のstoreを既に
   * 引いた操作は、そのstoreで最後まで進む。
   */
  apply(row: StorageBackendRow): void {
    if (this.isEnvironmentBackend(row.name)) return;
    if ((this.appliedRevisions.get(row.name) ?? 0) >= row.revision) return;
    this.appliedRevisions.set(row.name, row.revision);
    try {
      this.stores.replace(row.name, { store: this.buildStore(row), acceptsWrites: row.enabled });
    } catch (error) {
      if (!(error instanceof StorageBackendUnavailableError)) throw error;
      // 鍵が直るまで、この保存先のArtifactはbackend_unavailableを返す。
      this.stores.delete(row.name);
      console.error(
        JSON.stringify({
          event: 'storage_backend_unavailable',
          backend: row.name,
          reason: error.reason,
        }),
      );
    }
  }

  /** 行から新しいstoreを作る。接続テストは無効な保存先にもこれを使う。 */
  buildStore(row: StorageBackendRow): ArtifactStore {
    return createArtifactStoreFromConfig({
      config: row.config,
      ...(row.accessKeyId ? { credentials: this.credentials(row, row.accessKeyId) } : {}),
      ...(row.caBundle ? { caBundle: row.caBundle } : {}),
    });
  }

  /** 環境変数で決まる保存先が使うstore。接続テスト用。 */
  environmentStore(backend: ArtifactBackend): ArtifactStore {
    return environmentStore(this.options.environmentStores, backend);
  }

  private credentials(row: StorageBackendRow, accessKeyId: string) {
    const { secretKey } = this.options;
    if (!row.secretEncrypted || !row.secretKeyId)
      throw new StorageBackendUnavailableError('secret_unreadable');
    if (!secretKey) throw new StorageBackendUnavailableError('secret_key_missing');
    try {
      const secretAccessKey = decryptSecret({
        key: secretKey,
        encrypted: { keyId: row.secretKeyId, payload: row.secretEncrypted },
        context: storageSecretContext(row.name),
      });
      return { accessKeyId, secretAccessKey };
    } catch {
      throw new StorageBackendUnavailableError('secret_unreadable');
    }
  }
}
