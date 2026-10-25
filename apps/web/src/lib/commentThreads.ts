import type { Comment } from '@mmt/contracts';

/** スレッドの先頭とその返信。返信は1段だけ（docs/api-contract.md）。 */
export interface CommentThreadGroup {
  root: Comment;
  replies: Comment[];
}

/**
 * APIから読んだページと、その後にこの画面で投稿・編集・削除したコメントを合わせる。手元の写しは
 * 後の要求に対するAPIの応答なので、こちらを優先する。
 */
export function mergeComments(loaded: readonly Comment[], local: readonly Comment[]): Comment[] {
  const byId = new Map(loaded.map((comment) => [comment.id, comment]));
  for (const comment of local) byId.set(comment.id, comment);
  return [...byId.values()];
}

// APIのスレッドの順。createdAtの順で、同じならidで決める。
function compareByCreation(left: Comment, right: Comment): number {
  const byTime = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (byTime !== 0) return byTime;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * コメントをAPIの順にスレッドへまとめる。先頭を読み込んでいない返信は、隠れないように単独の
 * スレッドとして出す。
 */
export function groupCommentThreads(comments: readonly Comment[]): CommentThreadGroup[] {
  const roots = comments.filter((comment) => comment.parentCommentId === null);
  const rootIds = new Set(roots.map((root) => root.id));
  const repliesByRoot = new Map<string, Comment[]>();
  const orphans: Comment[] = [];
  for (const comment of comments) {
    if (comment.parentCommentId === null) continue;
    if (!rootIds.has(comment.parentCommentId)) {
      orphans.push(comment);
      continue;
    }
    const replies = repliesByRoot.get(comment.parentCommentId) ?? [];
    replies.push(comment);
    repliesByRoot.set(comment.parentCommentId, replies);
  }
  return [...roots, ...orphans].sort(compareByCreation).map((root) => ({
    root,
    replies: (repliesByRoot.get(root.id) ?? []).sort(compareByCreation),
  }));
}
