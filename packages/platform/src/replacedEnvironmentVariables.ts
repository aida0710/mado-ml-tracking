/**
 * 今は読まない旧い環境変数の名前と、代わりに読む名前。v0.5.0で設定の名前をすべて`MMT_`で始まる形にした。
 * 旧名を読み替えるためではなく、旧名のまま残った設定を起動時に見つけて止めるために使う。
 */
export const REPLACED_ENVIRONMENT_VARIABLES: readonly { oldName: string; newName: string }[] = [
  // v0.5.0より前に名前を変えたもの。
  { oldName: 'DATABASE_URL', newName: 'MMT_DATABASE_URL' },
  // 値の形も違う（グループ1つでなく、グループ→roleの対応表のJSON）。
  { oldName: 'OIDC_ADMIN_GROUP', newName: 'MMT_OIDC_ROLE_MAPPING_JSON' },
  // v0.5.0で接頭辞を付けたもの。
  { oldName: 'HOST', newName: 'MMT_HOST' },
  { oldName: 'PORT', newName: 'MMT_PORT' },
  { oldName: 'AUTH_MODE', newName: 'MMT_AUTH_MODE' },
  { oldName: 'AUTH_SESSION_IDLE_SECONDS', newName: 'MMT_AUTH_SESSION_IDLE_SECONDS' },
  { oldName: 'AUTH_SESSION_ABSOLUTE_SECONDS', newName: 'MMT_AUTH_SESSION_ABSOLUTE_SECONDS' },
  { oldName: 'OIDC_ISSUER_URL', newName: 'MMT_OIDC_ISSUER_URL' },
  { oldName: 'OIDC_CLIENT_ID', newName: 'MMT_OIDC_CLIENT_ID' },
  { oldName: 'OIDC_CLIENT_SECRET', newName: 'MMT_OIDC_CLIENT_SECRET' },
  { oldName: 'OIDC_SCOPES', newName: 'MMT_OIDC_SCOPES' },
  { oldName: 'OIDC_ALLOWED_GROUPS', newName: 'MMT_OIDC_ALLOWED_GROUPS' },
  { oldName: 'OIDC_ROLE_MAPPING_JSON', newName: 'MMT_OIDC_ROLE_MAPPING_JSON' },
  { oldName: 'OIDC_DEFAULT_ROLE', newName: 'MMT_OIDC_DEFAULT_ROLE' },
  { oldName: 'OIDC_AUTO_LINK_VERIFIED_EMAIL', newName: 'MMT_OIDC_AUTO_LINK_VERIFIED_EMAIL' },
  { oldName: 'OIDC_LABEL', newName: 'MMT_OIDC_LABEL' },
  { oldName: 'OIDC_ALLOW_INSECURE_HTTP', newName: 'MMT_OIDC_ALLOW_INSECURE_HTTP' },
  { oldName: 'OIDC_RECHECK_SECONDS', newName: 'MMT_OIDC_RECHECK_SECONDS' },
  { oldName: 'OIDC_TOKEN_SYNC_MAX_AGE_SECONDS', newName: 'MMT_OIDC_TOKEN_SYNC_MAX_AGE_SECONDS' },
  { oldName: 'DEVELOPMENT_ADMIN_EMAIL', newName: 'MMT_DEVELOPMENT_ADMIN_EMAIL' },
  { oldName: 'ARTIFACT_FILESYSTEM_ROOT', newName: 'MMT_ARTIFACT_FILESYSTEM_ROOT' },
  { oldName: 'S3_BUCKET', newName: 'MMT_S3_BUCKET' },
  { oldName: 'S3_ENDPOINT', newName: 'MMT_S3_ENDPOINT' },
  { oldName: 'S3_REGION', newName: 'MMT_S3_REGION' },
  { oldName: 'S3_PREFIX', newName: 'MMT_S3_PREFIX' },
  { oldName: 'S3_FORCE_PATH_STYLE', newName: 'MMT_S3_FORCE_PATH_STYLE' },
  { oldName: 'S3_ACCESS_KEY_ID', newName: 'MMT_S3_ACCESS_KEY_ID' },
  { oldName: 'S3_SECRET_ACCESS_KEY', newName: 'MMT_S3_SECRET_ACCESS_KEY' },
];

/**
 * 旧名だけが設定され、代わりの名前が無い環境変数があれば、その名前を並べたエラーで止める。
 * 値には認証情報が入りうるので、設定されているか（空の値も設定とみなす）だけを見て、中身は見ない。
 * 両方あるときは新しい名前を使い、旧名は無視する。
 */
export function rejectReplacedEnvironmentVariables(environment: NodeJS.ProcessEnv): void {
  const isSet = (name: string) => environment[name] !== undefined;
  const leftovers = REPLACED_ENVIRONMENT_VARIABLES.filter(
    ({ oldName, newName }) => isSet(oldName) && !isSet(newName),
  );
  if (leftovers.length === 0) return;
  const replacements = leftovers.map(
    ({ oldName, newName }) => `${oldName} was replaced by ${newName}`,
  );
  throw new Error(`Old environment variable names are set: ${replacements.join('; ')}`);
}
