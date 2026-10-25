import { transaction, type Database } from '../db/database.js';
import { listSchedulableSweepIds } from '../repositories/sweepRepository.js';
import { PollingLoop } from './pollingLoop.js';
import type { SweepController } from './sweepController.js';

// 早期終了は、workerが数秒から数十秒ごとに送るメトリクスを比べる。これより短い間隔では、
// ほとんど同じ点を評価し直すだけになる。
export const SWEEP_TICK_INTERVAL_MS = 15000;

/** 実行中と一時停止中のSweepを定期的に進める。早期終了と、起動し損ねたtrialの回復を行う。 */
export class SweepScheduler {
  private readonly loop: PollingLoop;

  constructor(
    private readonly database: Database,
    private readonly controller: SweepController,
    intervalMs = SWEEP_TICK_INTERVAL_MS,
  ) {
    this.loop = new PollingLoop({
      intervalMs,
      run: () => this.tickAll(),
      failureEvent: 'sweep_scheduler_failed',
    });
  }

  start(): void {
    this.loop.start();
  }

  async stop(): Promise<void> {
    await this.loop.stop();
  }

  /** 進められるすべてのSweepを1回ずつ見る。失敗したSweepはログに残し、ほかのSweepは止めない。 */
  async tickAll(): Promise<void> {
    for (const sweepId of await listSchedulableSweepIds(this.database)) {
      try {
        await transaction(this.database, async (connection) => {
          // 別のプロセスか完了時のハンドラが、既にこのSweepを進めている。
          if (!(await this.controller.tryLock(connection, sweepId))) return;
          await this.controller.tick(connection, { sweepId, applyEarlyStopping: true });
        });
      } catch {
        // エラーの詳細にはSQLの文が含まれることがある。探すにはSweepのidで足りる。
        console.error(JSON.stringify({ event: 'sweep_tick_failed', sweepId }));
      }
    }
  }
}
