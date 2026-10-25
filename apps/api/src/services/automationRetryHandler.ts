import type { Job, Run } from '@mmt/contracts';
import type { Connection } from '../db/database.js';
import { findExecutionForRun } from '../repositories/automationExecutionLookup.js';
import { findJob } from '../repositories/jobRepository.js';
import type { ModelAutomationService } from './modelAutomationService.js';
import type { RunCompletionHandler, RunStatusChange } from './runCompletionService.js';

/**
 * 終了した自動実行のRunに、もう一度試行させるか。数えるのはRunとJobの両方が失敗したときだけ。
 * キャンセルは人の判断であり、Jobがまだ動いている間に終わったRun（SDKが早めにFAILEDを報告した
 * もの）では、Jobはworkerに任せる。workerを失ったなどの失敗の種類は、あとからここで見分けられる。
 */
export function isRetryableFailure(failure: {
  run: Pick<Run, 'status'>;
  job: Pick<Job, 'status'>;
}): boolean {
  return failure.run.status === 'failed' && failure.job.status === 'failed';
}

/**
 * 失敗した自動実行のRunを、ルールのmaxAttemptsまで再試行する。連鎖と昇格のあと、Sweepのtrialと
 * 通知の前に動く。再試行するのはその実行自身のRunだけ。人がJobを再試行して作ったRunは、
 * 探すときにはたどるが、再試行した人のもの。Runのtagは見ないので、人が手でtagを付けたRunは
 * 再試行しない。1つの実行からの再試行は1回だけなので、完了の再送やMLflowで開き直して終えた
 * 場合に2回目の試行を始めない。再試行が終わったら、連鎖のハンドラが次の段を始める。
 */
export class AutomationRetryHandler implements RunCompletionHandler {
  readonly name = 'automation-retry';

  constructor(private readonly automation: ModelAutomationService) {}

  async handle(connection: Connection, change: RunStatusChange): Promise<void> {
    const { run } = change;
    if (run.status !== 'failed') return;
    const execution = await findExecutionForRun(connection, {
      projectId: run.projectId,
      runId: run.id,
    });
    if (!execution || execution.runId !== run.id || !execution.jobId) return;
    const job = await findJob(connection, {
      projectId: run.projectId,
      id: execution.jobId,
      lock: true,
    });
    if (!isRetryableFailure({ run, job })) return;
    await this.automation.retryExecution(connection, { execution, run, job });
  }
}
