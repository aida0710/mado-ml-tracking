import type { User } from '@mmt/contracts';

export type SessionAuthMethod = 'local' | 'oidc' | 'development';

// Job tokenの発行先のJob。そのtokenでの書き込みはこのRunに限る。
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
    // API token自身の有効期限（ISO 8601）。このtokenが発行するtokenは、これより長く有効に
    // できない。nullは期限なし。
    expiresAt: string | null;
    job?: JobTokenBinding;
  } | null;
  // ブラウザのsessionだけが持つ。API tokenと、サーバーの中で作るprincipal（seed）には無い。
  session?: { tokenHash: string; authMethod: SessionAuthMethod; mustChangePassword: boolean };
}
