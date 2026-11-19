import { MADO_SCOPES, type MadoAccessTokenGrant } from '@mmt/contracts';
import { formatDate } from '../../lib/format';
import { text } from '../../i18n/catalog';
import { pluginsText } from '../../i18n/plugins';
import { formatList } from '../../i18n/textJoining';

/**
 * mado S3 Data Catalogは、連携が使うscopeを機能の権限として表示する。ほかのscopeは、
 * mado S3 Data Catalogでの名前のまま出す。
 */
function getScopeLabel(scope: string): string {
  return scope === MADO_SCOPES.metricsRead ? pluginsText.madoScopeMetricsRead : scope;
}

export function formatMadoTokenPermissions(grant: MadoAccessTokenGrant): string {
  return grant.scopes.length ? formatList(grant.scopes.map(getScopeLabel)) : pluginsText.madoNoPermissions;
}

export function formatMadoTokenExpiry(grant: MadoAccessTokenGrant): string {
  return grant.expiresAt ? formatDate(grant.expiresAt) : text.noExpiry;
}
