/**
 * 保存済みのmado S3 Data Catalogのaccess tokenで許されていること。最後の接続確認で
 * mado S3 Data Catalogが報告した内容。
 */
export interface MadoAccessTokenGrant {
  name: string;
  /** mado S3 Data Catalogのscope。{@link MADO_SCOPES}にあるものなど。 */
  scopes: string[];
  expiresAt: string | null;
}

/**
 * 連携が使うmado S3 Data Catalogのscope。mado S3 Data Catalogは、tokenの機能ごとの権限から
 * これを導く。
 */
export const MADO_SCOPES = {
  metricsRead: 'metrics:read',
} as const;
