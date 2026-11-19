/**
 * 保存済みのmado S3 Data Catalogのaccess tokenで許されていること。最後に接続を確かめたときに
 * mado S3 Data Catalogが報告した内容。
 */
export interface DataCatalogAccessTokenGrant {
  name: string;
  /** mado S3 Data Catalogのscope。{@link DATA_CATALOG_SCOPES}にあるものなど。 */
  scopes: string[];
  expiresAt: string | null;
}

/**
 * このアプリが使うmado S3 Data Catalogのscope。mado S3 Data Catalogは、tokenの機能ごとの権限から
 * これを導く。
 */
export const DATA_CATALOG_SCOPES = {
  metricsRead: 'metrics:read',
} as const;
