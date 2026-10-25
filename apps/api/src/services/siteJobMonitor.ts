import { SITE_SUBMISSION_REPORT_TIMEOUT_SECONDS, type Job } from '@mmt/contracts';
import { rows, transaction, type Database } from '../db/database.js';
import { jobColumns } from '../repositories/jobRepository.js';
import { PollingLoop } from './pollingLoop.js';
import type { RunCompletionService } from './runCompletionService.js';
import { failUnstartedJob } from './siteJobEnding.js';

// キューの上限は数分から数日なので、1分に2回確かめれば十分に正確。
const MONITOR_INTERVAL_MS = 30 * 1000;
const MONITOR_BATCH_SIZE = 100;
// 同じスキーマのすべてのAPIのプロセスで共有し、Jobを終えるのが1つのプロセスだけになるようにする。
const MONITOR_LOCK_NAME = 'site_job_monitor';

/**
 * もう始められないsiteのJobを終える。スケジューラのキューでsiteのqueueTimeoutSecondsを超えて
 * 待ったもの（そのあとlauncherがキューから取り除く）と、launcherや`mado-tracking submit`が
 * claimしたまま、job shellの結果を報告してこないもの。runnerが始まったJobはここでは終えない。
 * runnerが自分で報告する。
 */
export class SiteJobMonitor {
  private readonly loop: PollingLoop;

  constructor(
    private readonly database: Database,
    private readonly runCompletion: RunCompletionService,
    intervalMs = MONITOR_INTERVAL_MS,
  ) {
    this.loop = new PollingLoop({
      intervalMs,
      run: () => this.check(),
      failureEvent: 'site_job_monitor_failed',
    });
  }

  start(): void {
    this.loop.start();
  }

  async stop(): Promise<void> {
    await this.loop.stop();
  }

  /** 終えたJobの数を返す。別のプロセスが監視のロックを持っているときも0。 */
  async check(): Promise<number> {
    let ended = 0;
    for (;;) {
      const batch = await this.checkBatch();
      ended += batch;
      if (batch < MONITOR_BATCH_SIZE) return ended;
    }
  }

  private async checkBatch(): Promise<number> {
    return transaction(this.database, async (connection) => {
      const lock = await connection.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1||':'||current_schema(),0)) AS acquired",
        [MONITOR_LOCK_NAME],
      );
      if (!lock.rows[0]?.acquired) return 0;
      const expired = await rows<Job>(
        connection,
        `SELECT ${jobColumns('j')} FROM jobs j JOIN compute_targets t ON t.id=j.target_id
        WHERE j.status='claimed' AND (
          (j.phase='submitted' AND t.queue_timeout_seconds IS NOT NULL
            AND j.submitted_at < now() - make_interval(secs => t.queue_timeout_seconds))
          OR (j.phase='submitting' AND j.heartbeat_at < now() - make_interval(secs => $2)))
        ORDER BY j.created_at,j.id LIMIT $1 FOR UPDATE OF j SKIP LOCKED`,
        [MONITOR_BATCH_SIZE, SITE_SUBMISSION_REPORT_TIMEOUT_SECONDS],
      );
      for (const job of expired)
        await failUnstartedJob(
          connection,
          this.runCompletion,
          job.phase === 'submitted'
            ? { job, endReason: 'queue_timeout', error: 'siteの待ち行列の上限時間を過ぎました' }
            : { job, endReason: 'submit_failed', error: 'job shellの結果が報告されませんでした' },
        );
      return expired.length;
    });
  }
}
