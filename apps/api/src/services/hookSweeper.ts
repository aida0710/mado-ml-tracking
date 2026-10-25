import { HOOK_PENDING_MAX_AGE_HOURS } from '@mmt/contracts';
import { transaction, type Database } from '../db/database.js';
import type { HookDispatcher } from './hookDispatcher.js';
import type { JobArrayCompletionHandler } from './jobArrayCompletionHandler.js';
import { PollingLoop } from './pollingLoop.js';

// 保留中の起動は数日で期限が切れ、止まったままのarrayはまれな残りものなので、数分おきで足りる。
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const SWEEP_BATCH_SIZE = 100;
// 同じスキーマのすべてのAPIプロセスで共有し、一度に1つだけが掃除するようにする。
const SWEEPER_LOCK_NAME = 'hook_sweeper';

/**
 * フックがイベントの時点ではできない後始末。Runが終わらないままの保留中の起動を飛ばし
 * （source_run_timeout）、最後のメンバーがJobの状態遷移なしに終わったarray（Jobが動き続けている
 * 間にPATCHで終わらせたRun）を終わらせる。
 */
export class HookSweeper {
  private readonly loop: PollingLoop;

  constructor(
    private readonly database: Database,
    private readonly hooks: HookDispatcher,
    private readonly arrays: JobArrayCompletionHandler,
    private readonly maxAgeHours = HOOK_PENDING_MAX_AGE_HOURS,
  ) {
    this.loop = new PollingLoop({
      intervalMs: SWEEP_INTERVAL_MS,
      run: () => this.sweep(),
      failureEvent: 'hook_sweep_failed',
    });
  }

  start(): void {
    this.loop.start();
  }

  async stop(): Promise<void> {
    await this.loop.stop();
  }

  /** 期限切れにした実行と終わらせたarrayの数を返す。ほかのプロセスが掃除しているときは0。 */
  async sweep(): Promise<number> {
    return transaction(this.database, async (connection) => {
      const lock = await connection.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1||':'||current_schema(),0)) AS acquired",
        [SWEEPER_LOCK_NAME],
      );
      if (!lock.rows[0]?.acquired) return 0;
      let changed = await this.hooks.expirePending(connection, {
        maxAgeHours: this.maxAgeHours,
        limit: SWEEP_BATCH_SIZE,
      });
      for (const groupId of await this.arrays.listIdleGroups(connection, SWEEP_BATCH_SIZE))
        if (await this.arrays.finishIfDone(connection, groupId)) changed += 1;
      return changed;
    });
  }
}
