import type { JobArrayGroup } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import type { HookDispatcher } from './hookDispatcher.js';
import type { RunCompletionHandler, RunStatusChange } from './runCompletionService.js';

const arrayGroupColumns =
  'id,project_id,target_id,size,created_by,parent_job_id,hook_id,finished_at,created_at';

/**
 * 最後のメンバーが終わったarrayを終了済みにし、array_finishedのフックを起動する。再試行される
 * メンバーは、Runが終わる前に再試行がキューに入る（RunnerService、自動の再試行）ので、まだ動く
 * 再試行があるarrayは開いたままになる。
 */
export class JobArrayCompletionHandler implements RunCompletionHandler {
  readonly name = 'job-array-completion';

  constructor(private readonly hooks: HookDispatcher) {}

  async handle(connection: Connection, change: RunStatusChange): Promise<void> {
    const member = await first<{ arrayGroupId: string | null }>(
      connection,
      'SELECT array_group_id FROM jobs WHERE run_id=$1',
      [change.run.id],
    );
    if (member?.arrayGroupId) await this.finishIfDone(connection, member.arrayGroupId);
  }

  /** 最後のRunがJobを通さずに終わったarray（RunのPATCH）にも、HookSweeperが使う。 */
  async finishIfDone(connection: Connection, arrayGroupId: string): Promise<boolean> {
    // グループをロックして同時に終わるメンバーを順に並べ、最後の1つがほかを見られるようにする。
    const group = await first<JobArrayGroup>(
      connection,
      `SELECT ${arrayGroupColumns} FROM job_array_groups WHERE id=$1 AND finished_at IS NULL FOR UPDATE`,
      [arrayGroupId],
    );
    if (!group) return false;
    const unfinished = await first(
      connection,
      "SELECT 1 FROM jobs WHERE array_group_id=$1 AND status IN ('queued','claimed','running') LIMIT 1",
      [group.id],
    );
    if (unfinished) return false;
    const finished = (await first<JobArrayGroup>(
      connection,
      `UPDATE job_array_groups SET finished_at=now() WHERE id=$1 RETURNING ${arrayGroupColumns}`,
      [group.id],
    ))!;
    await this.hooks.onArrayFinished(connection, finished);
    return true;
  }

  /** 終わっていないメンバーが無いのに開いたままのarray。古い順。 */
  async listIdleGroups(connection: Connection, limit: number): Promise<string[]> {
    const idle = await rows<{ id: string }>(
      connection,
      `SELECT g.id FROM job_array_groups g WHERE g.finished_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.array_group_id=g.id AND j.status IN ('queued','claimed','running'))
      ORDER BY g.created_at LIMIT $1`,
      [limit],
    );
    return idle.map((group) => group.id);
  }
}
