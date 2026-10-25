import type { RunNote } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { transaction, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import { storedRunNote } from '../domain/runNote.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import { lockRunForNote, writeRunNote } from '../repositories/runNoteRepository.js';
import { rejectJobToken, requireProject } from './accessService.js';
import { auditActor, NO_REQUEST_METADATA, recordDenial } from './auditService.js';

/**
 * mlflow.note.contentのタグに保存したRunの説明を編集する。
 * 説明は実験の結果ではないので、JobのRunが終わったあとも編集できる。
 */
export class RunNoteService {
  constructor(private readonly database: Database) {}

  async update(
    principal: Principal,
    note: { projectId: string; runId: string; content: string },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<RunNote> {
    const { projectId, runId, content } = note;
    // 監査ログには長さだけを記録する。説明そのものには何が書かれているか分からない。
    const details = { length: content.length };
    const draft = {
      ...auditActor(principal),
      ...request,
      action: 'run.note.update',
      resourceType: 'run',
      resourceId: runId,
      projectId,
      details,
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        rejectJobToken(principal);
        await requireProject(connection, principal, {
          projectId,
          role: 'editor',
          scope: 'runs:write',
        });
        const run = await lockRunForNote(connection, { projectId, runId });
        if (!run) notFound('run');
        if (run.lifecycleStage === 'deleted')
          throw new DomainError({
            status: 409,
            code: 'run_deleted',
            message: 'a deleted run cannot be edited',
          });
        await writeRunNote(connection, { runId, content: storedRunNote(content) });
        await writeAuditEvent(connection, { ...draft, outcome: 'success' });
        return { runId, content };
      }),
    );
  }
}
