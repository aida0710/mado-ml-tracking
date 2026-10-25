import {
  allowsMadoNamespace,
  MADO_SCOPES,
  type MadoAccessTokenGrant,
  type MadoPluginConfig,
} from '@mmt/contracts';
import { DomainError } from '../../domain/errors.js';

// Searching datasets and sending run records are the integration itself; capacity is optional.
const REQUIRED_SCOPES = [
  { scope: MADO_SCOPES.lineageRead, label: 'DataLineage read' },
  { scope: MADO_SCOPES.lineageWrite, label: 'DataLineage send' },
] as const;

/** Rejects a token that cannot search or cannot record this connection's runs in Mado. */
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
