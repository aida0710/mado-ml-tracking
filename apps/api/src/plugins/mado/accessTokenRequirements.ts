import {
  allowsMadoNamespace,
  MADO_SCOPES,
  type MadoAccessTokenGrant,
  type MadoPluginConfig,
} from '@mmt/contracts';
import { DomainError } from '../../domain/errors.js';

// データセットの検索とRunの記録の送信が連携そのもので、capacityは任意。
const REQUIRED_SCOPES = [
  { scope: MADO_SCOPES.lineageRead, label: 'DataLineage read' },
  { scope: MADO_SCOPES.lineageWrite, label: 'DataLineage send' },
] as const;

/** 検索できないtoken、またはこの接続のRunをmado S3 Data Catalogに記録できないtokenを拒否する。 */
export function assertAccessTokenCoversConnection(
  grant: MadoAccessTokenGrant,
  config: Pick<MadoPluginConfig, 'jobNamespace'>,
): void {
  const missing = REQUIRED_SCOPES.filter(({ scope }) => !grant.scopes.includes(scope));
  if (missing.length)
    throw new DomainError({
      status: 422,
      code: 'plugin_token_scope_missing',
      message: `allow ${missing.map(({ label }) => label).join(' and ')} on the Mado access token`,
      details: { scopes: missing.map(({ scope }) => scope) },
    });
  if (!allowsMadoNamespace(grant, config.jobNamespace))
    throw new DomainError({
      status: 422,
      code: 'plugin_job_namespace_not_allowed',
      message: `allow the run namespace "${config.jobNamespace}" on the Mado access token`,
      details: { namespace: config.jobNamespace },
    });
}
