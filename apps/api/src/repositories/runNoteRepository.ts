import { RUN_NOTE_TAG } from '@mmt/contracts';
import { first, type Connection } from '../db/database.js';

export interface LockedRunForNote {
  id: string;
  lifecycleStage: 'active' | 'deleted';
}

// Runの行をロックし、MLflowから同時にタグを書いても説明を上書きできないようにする。
export async function lockRunForNote(
  connection: Connection,
  run: { projectId: string; runId: string },
): Promise<LockedRunForNote | undefined> {
  return first<LockedRunForNote>(
    connection,
    'SELECT id,lifecycle_stage FROM runs WHERE id=$1 AND project_id=$2 FOR UPDATE',
    [run.runId, run.projectId],
  );
}

// 説明のキーだけを書き、Runを読んだ後に変わったほかのタグを残す。
export async function writeRunNote(
  connection: Connection,
  note: { runId: string; content: string | null },
): Promise<void> {
  if (note.content === null) {
    await connection.query('UPDATE runs SET tags=tags-$2::text WHERE id=$1', [
      note.runId,
      RUN_NOTE_TAG,
    ]);
    return;
  }
  await connection.query(
    'UPDATE runs SET tags=jsonb_set(tags,ARRAY[$2::text],to_jsonb($3::text)) WHERE id=$1',
    [note.runId, RUN_NOTE_TAG, note.content],
  );
}
