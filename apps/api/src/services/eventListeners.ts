import type { Connection } from '../db/database.js';

const LISTENER_SAVEPOINT = 'event_listener';

/**
 * listenerを、それが受け取るイベント（登録、checkpointの保存）のトランザクションの中で動かす。
 * 失敗したlistenerはsavepointまで巻き戻してログに残すので、イベント自体は保存される。
 * RunCompletionServiceがハンドラに対して行うのと同じ。
 */
export async function notifyListener(
  connection: Connection,
  notification: { listener: string; subjectId: string; notify: () => Promise<void> },
): Promise<void> {
  await connection.query(`SAVEPOINT ${LISTENER_SAVEPOINT}`);
  try {
    await notification.notify();
  } catch (error) {
    await connection.query(`ROLLBACK TO SAVEPOINT ${LISTENER_SAVEPOINT}`);
    console.error(
      JSON.stringify({
        event: 'event_listener_failed',
        listener: notification.listener,
        subjectId: notification.subjectId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
  await connection.query(`RELEASE SAVEPOINT ${LISTENER_SAVEPOINT}`);
}
