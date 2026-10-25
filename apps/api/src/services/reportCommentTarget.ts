import { findReportArchiveState } from '../repositories/reportRepository.js';
import type { CommentTargetDefinition } from './commentTargets.js';

/**
 * レポートへのコメント。アーカイブしたレポートのコメントは読めるが、削除したRunと同じく新しい
 * コメントは受け付けない（409 comment_target_deleted）。書き込みには編集と同じscopeが要る。
 */
export const reportCommentTarget: CommentTargetDefinition = {
  writeScope: 'runs:write',
  async findState(connection, target) {
    const report = await findReportArchiveState(connection, {
      projectId: target.projectId,
      reportId: target.targetId,
    });
    if (!report) return undefined;
    return report.archived ? 'deleted' : 'active';
  },
};
