import type { Job, JobEndReason, Run } from '@mmt/contracts';
import { first, type Connection } from '../db/database.js';
import { jobColumns } from '../repositories/jobRepository.js';
import { findRun } from '../repositories/registryRepository.js';
import { runColumns } from '../repositories/runListProjection.js';
import type { RunCompletionService } from './runCompletionService.js';

/**
 * コンピュータのJobのうち、投入の数を数える。siteがarrayを扱えるなら（真偽値の引数
 * supportsArray）arrayの要素をまとめて1回、扱えないなら要素ごとに1回と数える。
 */
export function submissionCountSql(supportsArray: string, filter = ''): string {
  return `count(DISTINCT CASE WHEN ${supportsArray}::boolean THEN COALESCE(array_group_id,id) ELSE id END)${filter}::int`;
}

/**
 * runnerが始まらなかったJobを失敗にする。siteのjob shellが拒んだ、結果が返ってこなかった、
 * スケジューラのキューで長く待ちすぎた、のいずれか。または、依頼者がもうそのコンピュータを
 * 使えない場合（workerがclaimしようとしたときの、sshやlocalのJobも含む）。まだスケジューラの
 * キューにいるJobには、launcherが取り除くよう印も付ける（scheduler_cancel_state）。
 * 呼び出し元はJobの行のロックを持っている。
 */
export async function failUnstartedJob(
  connection: Connection,
  runCompletion: RunCompletionService,
  failure: { job: Job; endReason: Exclude<JobEndReason, 'timed_out'>; error: string },
): Promise<Job> {
  const { job } = failure;
  const previousRun = await findRun(connection, {
    projectId: job.projectId,
    id: job.runId,
    lock: true,
  });
  const failed = (await first<Job>(
    connection,
    `UPDATE jobs SET status='failed',end_reason=$2,error=$3,ended_at=now(),
      scheduler_cancel_state=CASE WHEN scheduler_job_id IS NULL THEN NULL ELSE 'pending' END
    WHERE id=$1 RETURNING ${jobColumns()}`,
    [job.id, failure.endReason, failure.error],
  ))!;
  const run = (await first<Run>(
    connection,
    `UPDATE runs SET status='failed',error=$2,ended_at=now() WHERE id=$1 RETURNING ${runColumns}`,
    [job.runId, failure.error],
  ))!;
  await runCompletion.recordStatusChange(connection, { previousStatus: previousRun.status, run });
  return failed;
}
