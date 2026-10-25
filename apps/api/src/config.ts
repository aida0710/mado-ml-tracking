import { requireDatabaseUrl } from './db/databaseSettings.js';
import { z } from 'zod';
import type { AuthMode } from '@mmt/contracts';
import { createOidcRolePolicy, type OidcRolePolicy } from './domain/oidcRolePolicy.js';
import { parseSecretKey, type SecretKey } from './security/secretEncryption.js';
import {
  normalizeRegistryHost,
  type RegistryCredentials,
} from './services/imagePlatformChecker.js';
import { containsControlCharacter, DEFAULT_CHECKPOINT_KEEP_COUNT } from '@mmt/contracts';
import { parseSmtpSettings, type SmtpSettings } from '@mmt/platform';

const optionalSetting = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);
// 運用者が管理するSSHのパスは、リポジトリのリクエストの本文からは受け付けない。
const optionalSshPath = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .string()
    .min(1)
    .max(4000)
    .refine((value) => value.startsWith('/') && !containsControlCharacter(value))
    .optional(),
);

// offline_accessがあると、SSOのsessionは再ログインなしで有効期間の短いaccess tokenを更新できる。
const DEFAULT_OIDC_SCOPES = 'openid profile email offline_access';

// ブラウザから離れていた時間も含めて、ログインを1週間保つ。
const DEFAULT_SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
// これより短いsessionだと、運用者がRunを読んでいる途中で切れてしまう。
const MIN_SESSION_IDLE_SECONDS = 5 * 60;
const MIN_SESSION_ABSOLUTE_SECONDS = 60 * 60;

// 1つのArtifactにcheckpointの一式が入ることがある。運用者はこの上限を上げ下げできる。
const DEFAULT_ARTIFACT_MAX_BYTES = 200 * 1024 ** 3;
// 1週間あれば、実データが消える前に管理者が誤った削除に気づける。
const DEFAULT_ARTIFACT_DELETE_GRACE_DAYS = 7;
// 0でリクエスト全体の期限を無くし、数時間かかるアップロードを無通信の時間だけで区切る。
const DEFAULT_UPLOAD_REQUEST_TIMEOUT_MS = 0;
// 止まったクライアントのソケットは、2分間何も受け取らなければ解放する。
const DEFAULT_UPLOAD_IDLE_TIMEOUT_MS = 120_000;
// MLflowのmpu/completeは同期で応答する。待ち時間をSDKの既定のリクエストタイムアウト（120秒）
// より短くし、検証が遅いときはSDKが諦めて中断する前に503を返す。
const DEFAULT_UPLOAD_FINALIZE_WAIT_MS = 100_000;
// APIのリクエストが有効期限を省いたときは、以前の既定の1年を保つ。
const DEFAULT_TOKEN_LIFETIME_DAYS = 365;
// 運用者が決める既定値には従来の10年の上限を残す。明示した有効期限には長さの上限が無い。
const MAX_TOKEN_DEFAULT_LIFETIME_DAYS = 3650;
const tokenDefaultLifetimeDaysSchema = z.coerce.number().int().min(1)
  .max(MAX_TOKEN_DEFAULT_LIFETIME_DAYS).default(DEFAULT_TOKEN_LIFETIME_DAYS);
// 前段のプロキシとWebのnginxで2つ。数個を超えるなら設定の誤り。
const MAX_TRUSTED_PROXY_HOPS = 5;
// 1回のCSV出力の行数。これを超えるとExcelで扱うのが遅くなるので、絞り込みで減らす。
const DEFAULT_CSV_EXPORT_MAX_ROWS = 50_000;
// レポートの1つのバージョンのスナップショットデータ（50MiB）。原寸のグラフや表のブロックが数個入る。
// すべてを固定するレポートは、代わりに一部のブロックを固定せずliveのまま残す。
const DEFAULT_REPORT_SNAPSHOT_MAX_BYTES = 50 * 1024 * 1024;
// SSOのsessionは、この間隔に1回までUserInfoに今のグループを問い合わせる（60秒）。
// これで、グループから外された利用者は、使っている最中でも1分ほどでアクセスを失う。
const DEFAULT_OIDC_RECHECK_SECONDS = 60;
// SSOの利用者のAPI tokenは、最後のグループ同期がこれより古いと使えなくなる（7日）。
const DEFAULT_OIDC_TOKEN_SYNC_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
// 1分より短いと、tokenのリクエストのたびにほぼ同期することになり、得るものが無い。
const MIN_OIDC_TOKEN_SYNC_MAX_AGE_SECONDS = 60;

const environmentSchema = z.object({
  NODE_ENV: z.string().default('development'),
  MMT_DATABASE_URL: optionalSetting,
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4182),
  // hybridは、SSOを導入するあいだ、ローカルの管理者を復旧の経路として残す。
  AUTH_MODE: z.enum(['local', 'oidc', 'hybrid', 'development']).default('hybrid'),
  AUTH_SESSION_IDLE_SECONDS: z.coerce
    .number()
    .int()
    .min(MIN_SESSION_IDLE_SECONDS)
    .default(DEFAULT_SESSION_LIFETIME_SECONDS),
  AUTH_SESSION_ABSOLUTE_SECONDS: z.coerce
    .number()
    .int()
    .min(MIN_SESSION_ABSOLUTE_SECONDS)
    .default(DEFAULT_SESSION_LIFETIME_SECONDS),
  MMT_PUBLIC_URL: z.url().default('http://127.0.0.1:4182'),
  MMT_WEB_ORIGIN: z.url().default('http://127.0.0.1:5182'),
  MMT_ALLOW_PRIVATE_ORIGINS: z.enum(['true', 'false']).default('false'),
  // APIの前にあり、X-Forwarded-Forに追記するリバースプロキシの数（composeではWebのnginx）。
  MMT_TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(MAX_TRUSTED_PROXY_HOPS).default(0),
  // OIDCが有効なときだけ検証するので、localモードでは残っている値を無視する。
  OIDC_ISSUER_URL: optionalSetting,
  OIDC_CLIENT_ID: optionalSetting,
  OIDC_CLIENT_SECRET: optionalSetting,
  OIDC_ALLOWED_GROUPS: optionalSetting,
  OIDC_ROLE_MAPPING_JSON: optionalSetting,
  OIDC_DEFAULT_ROLE: optionalSetting,
  // 既定は無効。メールアドレスで結び付けると、IdPのアカウントが同じメールアドレスの
  // ローカルアカウントを乗っ取れてしまう。
  OIDC_AUTO_LINK_VERIFIED_EMAIL: z.enum(['true', 'false']).default('false'),
  OIDC_SCOPES: z.string().default(DEFAULT_OIDC_SCOPES),
  OIDC_LABEL: z.string().min(1).max(100).default('Authentik'),
  OIDC_ALLOW_INSECURE_HTTP: z.enum(['true', 'false']).default('false'),
  // 32バイトのbase64。SSOのsessionに持つIdPのtokenを暗号化する。oidcとhybridでは必須。
  MMT_SESSION_ENCRYPTION_KEY: optionalSetting,
  OIDC_RECHECK_SECONDS: z.coerce.number().int().min(1).default(DEFAULT_OIDC_RECHECK_SECONDS),
  OIDC_TOKEN_SYNC_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .min(MIN_OIDC_TOKEN_SYNC_MAX_AGE_SECONDS)
    .default(DEFAULT_OIDC_TOKEN_SYNC_MAX_AGE_SECONDS),
  DEVELOPMENT_ADMIN_EMAIL: z
    .string()
    .regex(/^[^\s@]+@[^\s@]+$/)
    .default('admin@localhost'),
  MMT_ALLOW_LOCAL_EXECUTOR: z.enum(['true', 'false']).default('false'),
  MMT_ALLOW_SEED: z.enum(['true', 'false']).default('false'),
  MMT_GIT_SSH_KEY_PATH: optionalSshPath,
  MMT_GIT_KNOWN_HOSTS_PATH: optionalSshPath,
  MMT_ARTIFACT_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .default(DEFAULT_ARTIFACT_MAX_BYTES),
  MMT_ARTIFACT_DELETE_GRACE_DAYS: z.coerce
    .number()
    .int()
    .min(0)
    .max(3650)
    .default(DEFAULT_ARTIFACT_DELETE_GRACE_DAYS),
  MMT_UPLOAD_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_UPLOAD_REQUEST_TIMEOUT_MS),
  MMT_UPLOAD_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_UPLOAD_IDLE_TIMEOUT_MS),
  MMT_MLFLOW_MULTIPART_UPLOADS: z.enum(['true', 'false']).default('true'),
  // 署名付きURLでのダウンロードは実装していない。trueにするとMLflow 3.17以降のSDKの
  // ダウンロードが失敗する。
  MMT_MLFLOW_MULTIPART_DOWNLOADS: z.enum(['true', 'false']).default('false'),
  MMT_UPLOAD_FINALIZE_WAIT_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_UPLOAD_FINALIZE_WAIT_MS),
  // 32バイトのbase64。無いと、秘密情報が要る保存先を作れない。
  MMT_STORAGE_SECRET_KEY: optionalSetting,
  // 鍵を分けて、連携の認証情報を保存先の秘密情報から切り離す。
  MMT_PLUGIN_SECRET_KEY: optionalSetting,
  // 32バイトのbase64。無いとwebhookのフックを作れない（そのsecretは暗号化して持つ）。
  MMT_HOOK_SECRET_KEY: optionalSetting,
  // enforce: siteのJobのdockerイメージは、siteのCPU向けにビルドされている必要がある
  // （レジストリのmanifestで見る）。
  MMT_IMAGE_PLATFORM_CHECK: z.enum(['off', 'enforce']).default('off'),
  // その検査でprivateのイメージを読むための認証情報。MMT_REGISTRY_HOSTにだけ送る。
  // 3つすべてを設定するか、どれも設定しない。
  MMT_REGISTRY_HOST: optionalSetting,
  MMT_REGISTRY_USERNAME: optionalSetting,
  MMT_REGISTRY_PASSWORD: optionalSetting,
  MMT_TOKEN_DEFAULT_LIFETIME_DAYS: tokenDefaultLifetimeDaysSchema,
  MMT_CHECKPOINT_KEEP_COUNT: z.coerce.number().int().min(1).default(DEFAULT_CHECKPOINT_KEEP_COUNT),
  MMT_CSV_EXPORT_MAX_ROWS: z.coerce.number().int().positive().default(DEFAULT_CSV_EXPORT_MAX_ROWS),
  MMT_REPORT_SNAPSHOT_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_REPORT_SNAPSHOT_MAX_BYTES),
  // メールの通知は両方を設定したときだけ送る。URLにSMTPのパスワードが入ることがある。
  MMT_SMTP_URL: optionalSetting,
  MMT_SMTP_FROM: optionalSetting,
});

export interface ApiConfig {
  databaseUrl: string;
  host: string;
  port: number;
  authMode: AuthMode;
  // localとhybridでtrue。ユーザー名とパスワードでのログインと、初期の管理者（bootstrap）を
  // 受け付ける。
  localLoginEnabled: boolean;
  session: { idleSeconds: number; absoluteSeconds: number };
  publicUrl: string;
  webOrigin: string;
  allowPrivateOrigins: boolean;
  trustedProxyHops: number;
  secureCookies: boolean;
  oidc: {
    issuer: string;
    clientId: string;
    clientSecret?: string;
    rolePolicy: OidcRolePolicy;
    autoLinkVerifiedEmail: boolean;
    scopes: string;
    label: string;
    allowInsecureHttp: boolean;
    // SSOのsessionごとに保存するaccess tokenとrefresh tokenを暗号化する。
    sessionEncryptionKey: SecretKey;
    // 最後のUserInfoの確認からこれより時間がたったSSOのsessionは、もう一度確認する。
    recheckSeconds: number;
  } | null;
  developmentAdminEmail: string;
  allowLocalExecutor: boolean;
  allowSeed: boolean;
  repositorySsh: { keyPath: string; knownHostsPath: string } | null;
  artifactMaxBytes: number;
  // Artifactを削除してから、ガベージコレクタがその実データ（blob）を消すまでの日数。
  artifactDeleteGraceDays: number;
  // 0はタイムアウトを無効にする。
  uploadRequestTimeoutMs: number;
  uploadIdleTimeoutMs: number;
  // MLflowのserver-infoで知らせる。uploads=falseならmpu/*に、SDKが別の方法へ切り替える501を返す。
  mlflowMultipart: { uploadsEnabled: boolean; downloadsEnabled: boolean };
  // MLflowのmpu/completeが、503を返す前にアップロードの確定処理（finalizer）を待つ時間。
  uploadFinalizeWaitMs: number;
  // DBにある保存先の秘密情報を暗号化する。MMT_STORAGE_SECRET_KEYが無ければnull。
  storageSecretKey: SecretKey | null;
  pluginSecretKey: SecretKey | null;
  // webhookのフックのsecretを暗号化する。MMT_HOOK_SECRET_KEYが無ければnull。
  hookSecretKey: SecretKey | null;
  // siteのJobを待ち行列に入れる前に、イメージがsiteのCPUに合うかを確かめるか。
  imagePlatformCheck: 'off' | 'enforce';
  registryCredentials: RegistryCredentials | null;
  // tokenの作成でexpiresAtを省いたときの有効期間。明示したnullは期限なし。
  tokenDefaultLifetimeDays: number;
  // Runごとに既定で見せるcheckpointの数。それより古いものはretained=falseになる（ファイルは残す）。
  checkpointKeepCount: number;
  // POST /runs/search/export.csvの行数。超えた分は切り、末尾にその旨を書く。
  csvExportMaxRows: number;
  // レポートの1つのバージョンのスナップショットデータ。これより大きい保存は
  // 413 report_snapshot_too_large。
  reportSnapshotMaxBytes: number;
  // SSOのIDを持つ利用者のAPI tokenは、この秒数以内にグループを同期している必要がある。
  oidcTokenSyncMaxAgeSeconds: number;
  // nullだと、メールの通知先は保存できるが送れない（email_sender_unavailable）。
  smtp: SmtpSettings | null;
}

function parseOptionalSecretKey(base64: string | undefined, settingName: string): SecretKey | null {
  if (!base64) return null;
  try {
    return parseSecretKey(base64);
  } catch {
    // 設定のエラーは、渡された認証情報を見せずに、どの設定かだけを示す。
    throw new Error(`${settingName} must be base64 of 32 bytes`);
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  if (environment.OIDC_ADMIN_GROUP !== undefined)
    throw new Error('OIDC_ADMIN_GROUP is not supported; use OIDC_ROLE_MAPPING_JSON');
  // 項目名だけを伝える。環境変数の値には認証情報が入りうる。
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success)
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  const settings = parsed.data;
  if (!!settings.MMT_GIT_SSH_KEY_PATH !== !!settings.MMT_GIT_KNOWN_HOSTS_PATH)
    throw new Error('MMT_GIT_SSH_KEY_PATH and MMT_GIT_KNOWN_HOSTS_PATH must be set together');
  const databaseUrl = requireDatabaseUrl(environment);
  const isProduction = settings.NODE_ENV === 'production';
  if (isProduction && settings.AUTH_MODE === 'development')
    throw new Error('Development authentication is forbidden in production');
  const publicUrl = new URL(settings.MMT_PUBLIC_URL);
  const webUrl = new URL(settings.MMT_WEB_ORIGIN);
  if (![publicUrl, webUrl].every((url) => ['http:', 'https:'].includes(url.protocol)))
    throw new Error('Public URLs require HTTP or HTTPS');
  if (publicUrl.username || publicUrl.password || webUrl.username || webUrl.password)
    throw new Error('Public URLs must not contain credentials');
  if (isProduction && (publicUrl.protocol !== 'https:' || webUrl.protocol !== 'https:'))
    throw new Error('Production URLs require HTTPS');
  const allowInsecureHttp = settings.OIDC_ALLOW_INSECURE_HTTP === 'true';
  if (isProduction && allowInsecureHttp)
    throw new Error('Insecure OIDC transport is forbidden in production');
  if (settings.AUTH_SESSION_IDLE_SECONDS > settings.AUTH_SESSION_ABSOLUTE_SECONDS)
    throw new Error('AUTH_SESSION_IDLE_SECONDS must not exceed AUTH_SESSION_ABSOLUTE_SECONDS');
  const storageSecretKey = parseOptionalSecretKey(
    settings.MMT_STORAGE_SECRET_KEY,
    'MMT_STORAGE_SECRET_KEY',
  );
  const pluginSecretKey = parseOptionalSecretKey(
    settings.MMT_PLUGIN_SECRET_KEY,
    'MMT_PLUGIN_SECRET_KEY',
  );
  const hookSecretKey = parseOptionalSecretKey(settings.MMT_HOOK_SECRET_KEY, 'MMT_HOOK_SECRET_KEY');
  const registrySettings = [
    settings.MMT_REGISTRY_HOST,
    settings.MMT_REGISTRY_USERNAME,
    settings.MMT_REGISTRY_PASSWORD,
  ];
  if (registrySettings.some(Boolean) && !registrySettings.every(Boolean))
    throw new Error(
      'MMT_REGISTRY_HOST, MMT_REGISTRY_USERNAME and MMT_REGISTRY_PASSWORD must be set together',
    );
  let oidc: ApiConfig['oidc'] = null;
  // localモードはOIDC_*を無視し、残ったSSOの設定が2つ目のログイン経路を開かないようにする。
  if (settings.AUTH_MODE === 'oidc' || settings.AUTH_MODE === 'hybrid') {
    if (!settings.OIDC_ISSUER_URL || !settings.OIDC_CLIENT_ID)
      throw new Error(
        `OIDC_ISSUER_URL and OIDC_CLIENT_ID are required when AUTH_MODE=${settings.AUTH_MODE}`,
      );
    if (!URL.canParse(settings.OIDC_ISSUER_URL)) throw new Error('OIDC_ISSUER_URL must be a URL');
    const issuerUrl = new URL(settings.OIDC_ISSUER_URL);
    if (issuerUrl.username || issuerUrl.password)
      throw new Error('OIDC issuer must not contain credentials');
    if (
      issuerUrl.protocol !== 'https:' &&
      !(
        allowInsecureHttp &&
        issuerUrl.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(issuerUrl.hostname)
      )
    ) {
      throw new Error(
        'OIDC issuer requires HTTPS; insecure HTTP is permitted only for an explicit loopback test provider',
      );
    }
    const scopes = settings.OIDC_SCOPES.split(/\s+/).filter(Boolean);
    if (!scopes.includes('openid')) throw new Error('OIDC_SCOPES must include openid');
    if (!settings.MMT_SESSION_ENCRYPTION_KEY)
      throw new Error(
        `MMT_SESSION_ENCRYPTION_KEY is required when AUTH_MODE=${settings.AUTH_MODE}`,
      );
    let sessionEncryptionKey: SecretKey;
    try {
      sessionEncryptionKey = parseSecretKey(settings.MMT_SESSION_ENCRYPTION_KEY);
    } catch {
      throw new Error('MMT_SESSION_ENCRYPTION_KEY must be base64 of 32 bytes');
    }
    oidc = {
      issuer: settings.OIDC_ISSUER_URL,
      clientId: settings.OIDC_CLIENT_ID,
      clientSecret: settings.OIDC_CLIENT_SECRET,
      rolePolicy: createOidcRolePolicy({
        allowedGroups: settings.OIDC_ALLOWED_GROUPS,
        roleMappingJson: settings.OIDC_ROLE_MAPPING_JSON,
        defaultRole: settings.OIDC_DEFAULT_ROLE,
      }),
      autoLinkVerifiedEmail: settings.OIDC_AUTO_LINK_VERIFIED_EMAIL === 'true',
      scopes: scopes.join(' '),
      label: settings.OIDC_LABEL,
      allowInsecureHttp,
      sessionEncryptionKey,
      recheckSeconds: settings.OIDC_RECHECK_SECONDS,
    };
  }
  return {
    databaseUrl,
    host: settings.HOST,
    port: settings.PORT,
    authMode: settings.AUTH_MODE,
    localLoginEnabled: settings.AUTH_MODE === 'local' || settings.AUTH_MODE === 'hybrid',
    session: {
      idleSeconds: settings.AUTH_SESSION_IDLE_SECONDS,
      absoluteSeconds: settings.AUTH_SESSION_ABSOLUTE_SECONDS,
    },
    publicUrl: publicUrl.origin,
    webOrigin: webUrl.origin,
    allowPrivateOrigins: settings.MMT_ALLOW_PRIVATE_ORIGINS === 'true',
    trustedProxyHops: settings.MMT_TRUSTED_PROXY_HOPS,
    secureCookies: publicUrl.protocol === 'https:',
    oidc,
    developmentAdminEmail: settings.DEVELOPMENT_ADMIN_EMAIL.toLowerCase(),
    allowLocalExecutor:
      settings.AUTH_MODE === 'development' && settings.MMT_ALLOW_LOCAL_EXECUTOR === 'true',
    allowSeed: settings.AUTH_MODE === 'development' && settings.MMT_ALLOW_SEED === 'true',
    repositorySsh:
      settings.MMT_GIT_SSH_KEY_PATH && settings.MMT_GIT_KNOWN_HOSTS_PATH
        ? {
            keyPath: settings.MMT_GIT_SSH_KEY_PATH,
            knownHostsPath: settings.MMT_GIT_KNOWN_HOSTS_PATH,
          }
        : null,
    artifactMaxBytes: settings.MMT_ARTIFACT_MAX_BYTES,
    artifactDeleteGraceDays: settings.MMT_ARTIFACT_DELETE_GRACE_DAYS,
    uploadRequestTimeoutMs: settings.MMT_UPLOAD_REQUEST_TIMEOUT_MS,
    uploadIdleTimeoutMs: settings.MMT_UPLOAD_IDLE_TIMEOUT_MS,
    mlflowMultipart: {
      uploadsEnabled: settings.MMT_MLFLOW_MULTIPART_UPLOADS === 'true',
      downloadsEnabled: settings.MMT_MLFLOW_MULTIPART_DOWNLOADS === 'true',
    },
    uploadFinalizeWaitMs: settings.MMT_UPLOAD_FINALIZE_WAIT_MS,
    storageSecretKey,
    pluginSecretKey,
    hookSecretKey,
    imagePlatformCheck: settings.MMT_IMAGE_PLATFORM_CHECK,
    registryCredentials:
      settings.MMT_REGISTRY_HOST && settings.MMT_REGISTRY_USERNAME && settings.MMT_REGISTRY_PASSWORD
        ? {
            registry: normalizeRegistryHost(settings.MMT_REGISTRY_HOST),
            username: settings.MMT_REGISTRY_USERNAME,
            password: settings.MMT_REGISTRY_PASSWORD,
          }
        : null,
    tokenDefaultLifetimeDays: settings.MMT_TOKEN_DEFAULT_LIFETIME_DAYS,
    checkpointKeepCount: settings.MMT_CHECKPOINT_KEEP_COUNT,
    csvExportMaxRows: settings.MMT_CSV_EXPORT_MAX_ROWS,
    reportSnapshotMaxBytes: settings.MMT_REPORT_SNAPSHOT_MAX_BYTES,
    oidcTokenSyncMaxAgeSeconds: settings.OIDC_TOKEN_SYNC_MAX_AGE_SECONDS,
    smtp: parseSmtpSettings({ url: settings.MMT_SMTP_URL, from: settings.MMT_SMTP_FROM }),
  };
}
