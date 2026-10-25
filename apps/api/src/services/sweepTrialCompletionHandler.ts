import type { Connection } from '../db/database.js';
import { findTrialByRunId } from '../repositories/sweepRepository.js';
import type { RunCompletionHandler, RunStatusChange } from './runCompletionService.js';
import type { SweepController } from './sweepController.js';

/**
 * SweepのtrialのRunが終わったときに結果を記録し、同じトランザクションで空いた枠に次のtrialを
 * 起動する。SweepのtrialでないRunは無視する。同じRunで繰り返し呼ばれても目的の値を計算し直す
 * だけで、parallelismやmax_trialsを超えて起動することはない。
 */
export class SweepTrialCompletionHandler implements RunCompletionHandler {
  readonly name = 'sweep_trial';

  constructor(private readonly controller: SweepController) {}

  async handle(connection: Connection, change: RunStatusChange): Promise<void> {
    const trial = await findTrialByRunId(connection, change.run.id);
    if (!trial) return;
    await this.controller.recordTrialEnd(connection, trial);
  }
}
