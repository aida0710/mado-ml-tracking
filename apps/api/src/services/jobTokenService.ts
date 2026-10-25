import type { Job } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { createJobTokenSecret, JOB_TOKEN_SCOPES } from '../auth/jobTokens.js';
import { hashSecret } from '../auth/secrets.js';
import { first, type Connection, type Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import {
  insertJobToken,
  jobTokenIdentity,
  revokeJobTokens,
} from '../repositories/jobTokenRepository.js';

/**
 * Jobのコードがworker tokenの代わりに受け取るtokenを発行し、認証する。このtokenはRunの作成者
 * として動くので、コードがその人のroleより強い権限を得ることはない。
 */
export class JobTokenService {
  constructor(private readonly database: Database) {}

  async authenticate(bearer: string): Promise<Principal> {
    const identity = await jobTokenIdentity(this.database, hashSecret(bearer));
    if (!identity)
      throw new DomainError({
        status: 401,
        code: 'invalid_token',
        message: 'the Job token is invalid or revoked',
      });
    return {
      user: identity.user,
      method: 'token',
      token: {
        id: identity.tokenId,
        projectId: identity.projectId,
        scopes: [...JOB_TOKEN_SCOPES],
        // Job tokenの固定のscopeではtokenを発行できないので、その有効期限が
        // ほかのtokenの期限の上限になることはない。
        expiresAt: null,
        job: identity.job,
      },
    };
  }

  /**
   * Jobがまだ`claimed`の間、つまりユーザーのプロセスがまだtokenを持ちえないうちに、新しいtokenを
   * 返す。
   * claim/resumeを繰り返すと（たとえばclaimの応答が失われたあと）、前のtokenは失効する。
   * `running`のJobにはnullを返す。そのプロセスは既にtokenを持ち、worker journalに残っている。
   */
  async issueForWorker(connection: Connection, job: Job): Promise<string | null> {
    // Jobをロックして同時のresumeを1つずつ処理し、発行したtokenが1つだけ残るようにする。
    const current = await first<{
      status: Job['status'];
      leaseId: string | null;
      createdBy: string;
    }>(
      connection,
      `SELECT j.status,j.lease_id,r.created_by FROM jobs j JOIN runs r ON r.id=j.run_id AND r.project_id=j.project_id
      WHERE j.id=$1 AND j.project_id=$2 FOR UPDATE OF j`,
      [job.id, job.projectId],
    );
    if (!current || current.status !== 'claimed' || !current.leaseId) return null;
    await revokeJobTokens(connection, job.id);
    const { token, tokenHash } = createJobTokenSecret();
    await insertJobToken(connection, {
      projectId: job.projectId,
      jobId: job.id,
      leaseId: current.leaseId,
      runId: job.runId,
      userId: current.createdBy,
      tokenHash,
    });
    return token;
  }
}
