import type { User } from '@mmt/contracts';

export type SessionAuthMethod = 'local' | 'oidc' | 'development';

// The Job a Job token was issued for; its writes are limited to this Run.
export interface JobTokenBinding {
  jobId: string;
  runId: string;
  leaseId: string;
}

export interface Principal {
  user: User;
  method: 'session' | 'token';
  // `job` は Job token（mado_mtj_）のときだけ付く。そのときの `id` は api_tokens でなく job_tokens の行を指す。
  token: {
    id: string;
    projectId: string | null;
    scopes: string[];
    // An API token's own expiry (ISO 8601); tokens it issues may not outlive it. Null never expires.
    expiresAt: string | null;
    job?: JobTokenBinding;
  } | null;
  // Browser sessions only; absent for API tokens and for principals built inside the server (seed).
  session?: { tokenHash: string; authMethod: SessionAuthMethod; mustChangePassword: boolean };
}
