import { DATA_CATALOG_SCOPES, type DataCatalogAccessTokenGrant } from '@mmt/contracts';
import { formatDate } from './format';
import { text } from '../i18n/catalog';
import { pluginsText } from '../i18n/plugins';
import { formatList } from '../i18n/textJoining';

/**
 * mado S3 Data Catalogは、このアプリが使うscopeを機能の権限として表示する。ほかのscopeは、
 * mado S3 Data Catalogでの名前のまま出す。
 */
function getScopeLabel(scope: string): string {
  return scope === DATA_CATALOG_SCOPES.metricsRead ? pluginsText.scopeMetricsRead : scope;
}

export function formatAccessTokenPermissions(grant: DataCatalogAccessTokenGrant): string {
  return grant.scopes.length
    ? formatList(grant.scopes.map(getScopeLabel))
    : pluginsText.noPermissions;
}

export function formatAccessTokenExpiry(grant: DataCatalogAccessTokenGrant): string {
  return grant.expiresAt ? formatDate(grant.expiresAt) : text.noExpiry;
}

export function canReadCapacity(grant: DataCatalogAccessTokenGrant): boolean {
  return grant.scopes.includes(DATA_CATALOG_SCOPES.metricsRead);
}
