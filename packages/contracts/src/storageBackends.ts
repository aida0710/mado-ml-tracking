/** Artifactの保存先の設定の出どころ。環境変数で設定した保存先は読み取り専用。 */
export type StorageBackendSource = 'environment' | 'database';
export type StorageBackendKind = 'filesystem' | 's3';

/** secret access keyは返さない。保存されているかはsecretConfiguredで分かる。 */
export interface StorageBackend {
  /** 変更できない。artifacts.backendとprojects.artifact_backendがこれを参照する。 */
  name: string;
  kind: StorageBackendKind;
  source: StorageBackendSource;
  rootPath?: string;
  endpoint?: string;
  region?: string;
  bucket?: string;
  prefix?: string;
  pathStyle?: boolean;
  signatureVersion: 'v4' | 'v2';
  tlsVerify: boolean;
  caBundleConfigured: boolean;
  checksumMode: 'when_required' | 'when_supported';
  multipartPartSizeBytes: number;
  /** S3だけ。falseなら各Artifactを1回のPUTで保存し、アップロードセッションを拒否する。 */
  multipartEnabled: boolean;
  accessKeyId?: string;
  secretConfigured: boolean;
  enabled: boolean;
}
export interface StorageBackendCreate {
  name: string;
  kind: StorageBackendKind;
  rootPath?: string;
  endpoint?: string | null;
  region?: string;
  bucket?: string;
  prefix?: string;
  pathStyle?: boolean;
  signatureVersion?: 'v4' | 'v2';
  tlsVerify?: boolean;
  checksumMode?: 'when_required' | 'when_supported';
  multipartPartSizeBytes?: number;
  multipartEnabled?: boolean;
  /** PEMのテキスト。更新でnullにすると消す。 */
  caBundle?: string | null;
  accessKeyId?: string | null;
  /** 更新で省略すると保存済みのsecretを保つ。nullにするとaccessKeyIdとともに消す。 */
  secretAccessKey?: string | null;
  enabled?: boolean;
}
export type StorageBackendPatch = Partial<Omit<StorageBackendCreate, 'name'>>;
export interface StorageSettings {
  defaultBackend: string;
}
export interface StorageTestStep {
  name: 'put' | 'get' | 'range' | 'delete';
  ok: boolean;
  error?: string;
}
export interface StorageTestResult {
  steps: StorageTestStep[];
}
/** GET /storage/backends: Projectが新しいArtifactの保存先として選べるもの。 */
export interface StorageBackendChoices {
  items: string[];
  defaultBackend: string;
}

/**
 * GET /admin/storage-directories?path=: 入力中のfilesystemの保存先のrootPathを補完する、APIサーバー
 * 上のディレクトリ。相対パスは、filesystemの保存先がrootPathを解決するのと同じ方法で（APIの
 * 作業ディレクトリから）解決する。
 */
export interface DirectorySuggestions {
  /** 入力されたパスを絶対パスにしたもの。 */
  resolvedPath: string;
  /**
   * resolvedPathが今どうなっているか。ディレクトリが無いことはここではエラーにしない。
   * 'unavailable': APIサーバーが時間内に読めなかった（応答しなくなったマウントなど）ので、何も
   * 分からない。
   */
  status: 'directory' | 'missing' | 'not_directory' | 'unavailable';
  /**
   * 入力されたパスを補完するディレクトリの絶対パス（名前の順）。入力が"/"で終わればそのディレクトリ
   * の子、そうでなければ最後の部分で始まる名前の兄弟。"."で始まる名前は、最後の部分が"."で
   * 始まるときだけ出る。
   */
  items: string[];
  /** itemsに入る数より多くのディレクトリが一致した。 */
  truncated: boolean;
}
