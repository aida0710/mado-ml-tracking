import { hashSecret, randomSecret } from './secrets.js';

// Job token は専用の前置きを持つ。認証が api_tokens を引かずに job_tokens へ振り分けられ、
// 漏れた値が Job 限定のものだと分かる。API token の mado_mt_ は mado_mtj_ に一致しない。
export const JOB_TOKEN_PREFIX = 'mado_mtj_';

// Jobのコードがそのtokenでできること。書き込みのガードがさらに1つのRunに絞る。
export const JOB_TOKEN_SCOPES = ['read', 'runs:write', 'artifacts:write', 'registry:write'];

export function isJobToken(bearer: string): boolean {
  return bearer.startsWith(JOB_TOKEN_PREFIX);
}

export function createJobTokenSecret(): { token: string; tokenHash: string } {
  const token = `${JOB_TOKEN_PREFIX}${randomSecret()}`;
  return { token, tokenHash: hashSecret(token) };
}
