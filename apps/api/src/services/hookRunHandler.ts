import type { Connection } from '../db/database.js';
import type { HookDispatcher } from './hookDispatcher.js';
import type { RunCompletionHandler, RunStatusChange } from './runCompletionService.js';

/** run_finishedのフックと、Runの終わりを待っていたもの（保留中の実行）を起動する。 */
export class HookRunHandler implements RunCompletionHandler {
  readonly name = 'hooks';

  constructor(private readonly hooks: HookDispatcher) {}

  async handle(connection: Connection, change: RunStatusChange): Promise<void> {
    await this.hooks.onRunEnded(connection, change.run);
  }
}
