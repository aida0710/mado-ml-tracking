import { transaction, type Database } from '../db/database.js';
import type { ModelAutomationService } from './modelAutomationService.js';

// 想定されるどの学習Runよりも長く、それでいて、終了を報告しないRun（workerの状態が分からない
// もの、end_runの無いMLflowのRun）が残した保留中の自動実行を、毎週片付けられる程度に短い。
export const AUTOMATION_PENDING_MAX_AGE_HOURS = 168;
// 期限は日単位なので、粗い間隔にしてクエリの負荷を無視できる程度に抑える。
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const SWEEP_BATCH_SIZE = 100;
// 同じスキーマを使うすべてのAPIのプロセスで共有し、一度に1つだけが片付けるようにする。
const SWEEPER_LOCK_NAME = 'automation_pending_sweeper';

export class AutomationPendingSweeper {
  private isStopped = true;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active: Promise<number> | undefined;

  constructor(
    private readonly database: Database,
    private readonly automation: ModelAutomationService,
    private readonly maxAgeHours = AUTOMATION_PENDING_MAX_AGE_HOURS,
  ) {}

  start(): void {
    if (!this.isStopped) return;
    this.isStopped = false;
    this.schedule();
  }

  async stop(): Promise<void> {
    this.isStopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.active?.catch(() => undefined);
  }

  // 期限切れにしたイベントの数を返す。別のプロセスが片付けのロックを持っているときも0。
  async sweep(): Promise<number> {
    let expired = 0;
    for (;;) {
      const batch = await this.sweepBatch();
      expired += batch;
      if (batch < SWEEP_BATCH_SIZE) return expired;
    }
  }

  private async sweepBatch(): Promise<number> {
    return transaction(this.database, async (connection) => {
      const lock = await connection.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1||':'||current_schema(),0)) AS acquired",
        [SWEEPER_LOCK_NAME],
      );
      if (!lock.rows[0]?.acquired) return 0;
      return this.automation.expirePendingRegistrations(connection, {
        maxAgeHours: this.maxAgeHours,
        limit: SWEEP_BATCH_SIZE,
      });
    });
  }

  private schedule(): void {
    if (this.isStopped) return;
    this.timer = setTimeout(() => {
      this.active = this.sweep();
      void this.active
        .catch(() => console.error(JSON.stringify({ event: 'automation_pending_sweep_failed' })))
        .finally(() => {
          this.active = undefined;
          this.schedule();
        });
    }, SWEEP_INTERVAL_MS);
    this.timer.unref();
  }
}
