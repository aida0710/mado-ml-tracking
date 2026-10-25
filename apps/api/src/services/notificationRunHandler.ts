import type { NotificationRunSummary, Run } from '@mmt/contracts';
import { first, type Connection } from '../db/database.js';
import { findExecutionForRun } from '../repositories/automationExecutionLookup.js';
import { enqueueNotificationEvent } from './notificationEvents.js';
import type { RunCompletionHandler, RunStatusChange } from './runCompletionService.js';

// workerのエラーは長いトレースバックのことがある。通知には先頭だけあれば足りる。
const MAX_RUN_ERROR_LENGTH = 1000;

const RUN_EVENT_TITLES: Record<'run.failed' | 'run.canceled' | 'run.finished', string> = {
  'run.failed': 'Runが失敗しました',
  'run.canceled': 'Runが中止されました',
  'run.finished': 'Runが完了しました',
};

function runEventType(run: Run): keyof typeof RUN_EVENT_TITLES | null {
  if (run.status === 'failed') return 'run.failed';
  if (run.status === 'canceled') return 'run.canceled';
  if (run.status === 'finished') return 'run.finished';
  return null;
}

/**
 * run.failed / run.canceled / run.finishedの通知を、終了状態へ移るトランザクションの中で
 * キューに入れる。完了がロールバックされれば通知も残らない。終了時のハンドラの最後に動く。
 * 重複除去のキーはイベントの種類とRunのidなので、完了が繰り返されても、MLflowが再開したRunが
 * 同じ終わり方をしても、2回は通知しない。
 */
export class NotificationRunHandler implements RunCompletionHandler {
  readonly name = 'notification';

  constructor(private readonly options: { webOrigin: string }) {}

  async handle(connection: Connection, change: RunStatusChange): Promise<void> {
    const { run } = change;
    const type = runEventType(run);
    if (!type) return;
    await enqueueNotificationEvent(connection, {
      projectId: run.projectId,
      type,
      dedupeKey: `${type}:${run.id}`,
      subject: {
        runKind: run.kind,
        experimentId: run.experimentId,
        isAutomation: async () =>
          (await findExecutionForRun(connection, { projectId: run.projectId, runId: run.id })) !==
          null,
      },
      describe: async () => ({
        title: `${RUN_EVENT_TITLES[type]}: ${run.name}`,
        run: await this.summarize(connection, run),
        url: `${this.options.webOrigin}/projects/${encodeURIComponent(run.projectId)}/runs/${encodeURIComponent(run.id)}`,
        occurredAt: run.endedAt ?? undefined,
      }),
    });
  }

  // 名前と結果だけを入れる。実行のスナップショット、parameter、タグ、environmentは入れない。
  private async summarize(connection: Connection, run: Run): Promise<NotificationRunSummary> {
    const experiment = await first<{ name: string }>(
      connection,
      'SELECT name FROM experiments WHERE id=$1 AND project_id=$2',
      [run.experimentId, run.projectId],
    );
    return {
      id: run.id,
      name: run.name,
      kind: run.kind,
      status: run.status,
      experimentId: run.experimentId,
      experimentName: experiment?.name ?? '',
      error: run.error ? run.error.slice(0, MAX_RUN_ERROR_LENGTH) : null,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
    };
  }
}
