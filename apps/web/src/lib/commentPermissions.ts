import type { Comment, ProjectRole } from '@mmt/contracts';
import { canEditProject, canManageProject } from './permissions';

// APIのcommentServiceと同じ判定にし、APIが拒む操作をスレッドに出さない。

export interface CommentViewer {
  userId: string;
  role: ProjectRole;
}

/** 投稿と返信にはeditorのロールが要る。viewerは読むだけ。 */
export function canPostComment(viewer: CommentViewer): boolean {
  return canEditProject(viewer.role);
}

/** 編集できるのは書いた本人だけで、そのProjectにまだ投稿できる間に限る。 */
export function canEditComment(comment: Comment, viewer: CommentViewer): boolean {
  return !comment.deleted && comment.author.id === viewer.userId && canEditProject(viewer.role);
}

/** 削除できるのは書いた本人（editor以上）かProject admin。 */
export function canDeleteComment(comment: Comment, viewer: CommentViewer): boolean {
  if (comment.deleted) return false;
  if (canManageProject(viewer.role)) return true;
  return comment.author.id === viewer.userId && canEditProject(viewer.role);
}
