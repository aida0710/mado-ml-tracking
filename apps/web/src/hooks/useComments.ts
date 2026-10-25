import { useMemo, useState } from 'react';
import type { Comment } from '@mmt/contracts';
import { commentsApi, type CommentTarget } from '../api/comments';
import { groupCommentThreads, mergeComments, type CommentThreadGroup } from '../lib/commentThreads';
import { useCursorPages } from './useCursorPages';

export interface CommentsState {
  threads: CommentThreadGroup[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  loadMore: () => void;
  reload: () => void;
  /** parentCommentIdがnullなら新しいスレッドを始める。失敗したらAPIのエラーでrejectする。 */
  post: (input: { body: string; parentCommentId: string | null }) => Promise<Comment>;
  edit: (commentId: string, body: string) => Promise<Comment>;
  remove: (comment: Comment) => Promise<void>;
}

/**
 * 1つの対象のコメントのスレッドをページごとに読み、ここで投稿・編集・削除したコメントを、
 * 読み込んだページをすべて読み直さずに表示に反映する。
 */
export function useComments(projectId: string, target: CommentTarget): CommentsState {
  const key = `${projectId}:${target.targetType}:${target.targetId}`;
  const pages = useCursorPages(key, (cursor, signal) =>
    commentsApi.list(projectId, target, { cursor, signal }),
  );
  // キーに結び付けておき、別の対象や読み直しのときはAPIの応答からやり直す。
  const [localChanges, setLocalChanges] = useState<{ key: string; comments: Comment[] }>({
    key,
    comments: [],
  });
  const threads = useMemo(
    () => groupCommentThreads(mergeComments(pages.items, localChanges.key === key ? localChanges.comments : [])),
    [pages.items, localChanges, key],
  );

  function keepLocally(comment: Comment) {
    setLocalChanges((previous) => ({
      key,
      comments: [
        ...(previous.key === key ? previous.comments : []).filter((item) => item.id !== comment.id),
        comment,
      ],
    }));
  }

  return {
    threads,
    hasMore: pages.hasMore,
    loading: pages.loading,
    error: pages.error,
    loadMore: pages.loadMore,
    reload: () => {
      setLocalChanges({ key, comments: [] });
      pages.reload();
    },
    post: async ({ body, parentCommentId }) => {
      const created = await commentsApi.create(projectId, { ...target, parentCommentId, body });
      keepLocally(created);
      return created;
    },
    edit: async (commentId, body) => {
      const updated = await commentsApi.update(projectId, commentId, { body });
      keepLocally(updated);
      return updated;
    },
    remove: async (comment) => {
      await commentsApi.remove(projectId, comment.id);
      // DELETEは204を返すので、削除後の状態は、APIが返すはずの形でここで書く。
      keepLocally({ ...comment, body: null, deleted: true });
    },
  };
}
