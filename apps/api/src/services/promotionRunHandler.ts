import type { Connection } from '../db/database.js';
import type { PromotionService } from './promotionService.js';
import type { RunCompletionHandler, RunStatusChange } from './runCompletionService.js';

// 終わった評価Runを、それを作ったルールの昇格policyで判定する。判定は終了状態への遷移の中で
// 行う（decisions.md: Runの終了と同じトランザクションで判定する）。全体のハンドラの順序では、
// 自動実行の連鎖のあと、自動再試行の前に置く。
export class PromotionRunHandler implements RunCompletionHandler {
  readonly name = 'promotion';

  constructor(private readonly promotion: PromotionService) {}

  async handle(connection: Connection, change: RunStatusChange): Promise<void> {
    await this.promotion.processFinishedRun(connection, change.run);
  }
}
