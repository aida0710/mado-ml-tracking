import type { Connection } from '../db/database.js';
import type { RunCompletionHandler, RunStatusChange } from './runCompletionService.js';
import type { ModelAutomationService } from './modelAutomationService.js';

// 学習Runがまだ動いている間に登録されたバージョンについて、自動実行の扱いを決める。
// MLflowのRunは開き直せる（FINISHED → RUNNING → FINISHED）ので、1つのRunでこれが2回以上
// 動くことがある。まだ保留中のイベントだけを扱うので、繰り返し呼ばれても重複して起動しない。
export class AutomationSourceRunHandler implements RunCompletionHandler {
  readonly name = 'automation-source-run';

  constructor(private readonly automation: ModelAutomationService) {}

  async handle(connection: Connection, change: RunStatusChange): Promise<void> {
    if (change.run.status === 'finished')
      await this.automation.releasePendingRegistrations(connection, change.run.id);
    else await this.automation.skipPendingRegistrations(connection, change.run.id);
  }
}
