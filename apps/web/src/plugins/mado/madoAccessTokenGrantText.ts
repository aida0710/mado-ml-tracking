import { allowsAllMadoNamespaces, MADO_SCOPES, type MadoAccessTokenGrant } from '@mmt/contracts';
import { formatDate } from '../../lib/format';
import { text } from '../../i18n/catalog';
import { pluginsText } from '../../i18n/plugins';
import { formatList } from '../../i18n/textJoining';

/** Mado shows these scopes as feature permissions; other scopes keep Mado's own name. */
function getScopeLabel(scope: string): string {
  switch (scope) {
    case MADO_SCOPES.lineageRead:
      return pluginsText.madoScopeLineageRead;
    case MADO_SCOPES.lineageWrite:
      return pluginsText.madoScopeLineageWrite;
    case MADO_SCOPES.metricsRead:
      return pluginsText.madoScopeMetricsRead;
    default:
      return scope;
  }
}

export function formatMadoTokenPermissions(grant: MadoAccessTokenGrant): string {
  return formatList(grant.scopes.map(getScopeLabel));
}

export function formatMadoTokenNamespaces(grant: MadoAccessTokenGrant): string {
  return allowsAllMadoNamespaces(grant) ? pluginsText.madoAllNamespaces : formatList(grant.namespaces);
}

export function formatMadoTokenExpiry(grant: MadoAccessTokenGrant): string {
  return grant.expiresAt ? formatDate(grant.expiresAt) : text.noExpiry;
}
