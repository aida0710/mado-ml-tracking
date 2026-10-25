/**
 * 保存済みのmado S3 Data Catalogのaccess tokenで許されていること。最後の接続確認で
 * mado S3 Data Catalogが報告した内容。
 */
export interface MadoAccessTokenGrant {
  name: string;
  /** mado S3 Data Catalogのscope。{@link MADO_SCOPES}にあるものなど。 */
  scopes: string[];
  /** `['*']`（{@link ALL_MADO_NAMESPACES}）ならすべてのnamespaceを許す。 */
  namespaces: string[];
  expiresAt: string | null;
}

/** すべてのnamespaceを許す、mado S3 Data Catalogのnamespaceの指定。 */
export const ALL_MADO_NAMESPACES = '*';
/**
 * 連携が使うmado S3 Data Catalogのscope。mado S3 Data Catalogは、tokenの機能ごとの権限から
 * これを導く。
 */
export const MADO_SCOPES = {
  lineageRead: 'lineage:read',
  lineageWrite: 'lineage:write',
  metricsRead: 'metrics:read',
} as const;

export function allowsAllMadoNamespaces(grant: MadoAccessTokenGrant): boolean {
  return grant.namespaces.includes(ALL_MADO_NAMESPACES);
}

export function allowsMadoNamespace(grant: MadoAccessTokenGrant, namespace: string): boolean {
  return allowsAllMadoNamespaces(grant) || grant.namespaces.includes(namespace);
}
