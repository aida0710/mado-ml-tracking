import type { Run, RunStatus } from '@mmt/contracts';
import type { Connection } from '../db/database.js';
import { isTerminalStatus } from '../domain/runTransitions.js';
import { enqueueRunEvent } from './outboxEvents.js';

export interface RunStatusChange {
  readonly previousStatus: RunStatus;
  // 変更後に保存されたRun。新しい状態を含む。
  readonly run: Run;
}

export interface RunCompletionHandler {
  // 変わらない名前。ログで使い、app.tsでの登録の順を書き表すのにも使う。
  readonly name: string;
  // Runを終了状態へ移したトランザクションの中で、遷移1回につき1回動く。投げたエラーは
  // savepointまで巻き戻してログに残す。失敗の記録を残す必要があるハンドラは、例外を投げずに
  // 自分のテーブルへ書く。
  handle(connection: Connection, change: RunStatusChange): Promise<void>;
}

const HANDLER_SAVEPOINT = 'run_completion_handler';

export class RunCompletionService {
  constructor(private readonly handlers: readonly RunCompletionHandler[]) {}

  // Runの状態の変更はすべてここを通る。pluginのoutboxのイベントは変更ごとに出す（run.startedを
  // 含む）が、終了時のハンドラは、終了していない状態から終了状態への遷移でだけ動く。
  async recordStatusChange(connection: Connection, change: RunStatusChange): Promise<void> {
    await enqueueRunEvent(connection, change.run);
    if (isTerminalStatus(change.previousStatus) || !isTerminalStatus(change.run.status)) return;
    for (const handler of this.handlers) await this.runHandler(connection, { handler, change });
  }

  // ハンドラの不具合でworkerの完了を妨げてはならない。妨げると、Run・Jobが終了状態にならず、
  // gpu_reservationsが解放されなくなる。
  private async runHandler(
    connection: Connection,
    invocation: { handler: RunCompletionHandler; change: RunStatusChange },
  ): Promise<void> {
    const { handler, change } = invocation;
    await connection.query(`SAVEPOINT ${HANDLER_SAVEPOINT}`);
    try {
      await handler.handle(connection, change);
    } catch (error) {
      await connection.query(`ROLLBACK TO SAVEPOINT ${HANDLER_SAVEPOINT}`);
      console.error(
        JSON.stringify({
          event: 'run_completion_handler_failed',
          handler: handler.name,
          runId: change.run.id,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    await connection.query(`RELEASE SAVEPOINT ${HANDLER_SAVEPOINT}`);
  }
}
