import {
  allowsMadoNamespace,
  MADO_SCOPES,
  type MadoAccessTokenGrant,
  type MadoPluginConfig,
} from '@mmt/contracts';
import { DomainError } from '../../domain/errors.js';

// Searching datasets and sending run records are the integration itself; capacity is optional.
const REQUIRED_SCOPES = [
  { scope: MADO_SCOPES.lineageRead, label: 'DataLineageの読み取り' },
  { scope: MADO_SCOPES.lineageWrite, label: 'DataLineageの送信' },
] as const;

/** Rejects a token that cannot search or cannot record this connection's runs in Mado. */
export function assertAccessTokenCoversConnection(
  grant: MadoAccessTokenGrant,
  config: Pick<MadoPluginConfig, 'jobNamespace'>,
): void {
  const missing = REQUIRED_SCOPES.filter(({ scope }) => !grant.scopes.includes(scope));
  if (missing.length)
    throw new DomainError(
      422,
      `Madoのアクセストークンに${missing.map(({ label }) => label).join('と')}を許可してください`,
      'plugin_token_scope_missing',
    );
  if (!allowsMadoNamespace(grant, config.jobNamespace))
    throw new DomainError(
      422,
      `RunのNamespace「${config.jobNamespace}」をMadoのアクセストークンで許可してください`,
      'plugin_job_namespace_not_allowed',
    );
}
