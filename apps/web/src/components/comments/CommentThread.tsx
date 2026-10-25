import { useState } from 'react';
import type { Comment } from '@mmt/contracts';
import type { CommentThreadProps } from '../charts/chartProps';
import { useAuth } from '../../hooks/useAuth';
import { useComments } from '../../hooks/useComments';
import { useProject } from '../../hooks/useProject';
import {
  canDeleteComment,
  canEditComment,
  canPostComment,
  type CommentViewer,
} from '../../lib/commentPermissions';
import { CommentEditor } from './CommentEditor';
import { CommentItem } from './CommentItem';
import { Empty, ErrorNotice, Loading } from '../Feedback';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/**
 * Run、モデルバージョン、レポートへのスレッド形式のコメント。返信は1段まで。Viewerは読むだけ。
 * 置くのはページ（RunDetailPage、ModelVersionPage、ReportPage）。
 */
export function CommentThread({ projectId, targetType, targetId }: CommentThreadProps) {
  useLocale();
  const { user } = useAuth();
  const { project } = useProject();
  const comments = useComments(projectId, { targetType, targetId });
  const [replyRootId, setReplyRootId] = useState<string | null>(null);
  const viewer: CommentViewer = { userId: user.id, role: project.role };
  const canPost = canPostComment(viewer);

  function renderComment(comment: Comment, threadRootId: string) {
    return (
      <CommentItem
        key={comment.id}
        comment={comment}
        onReply={canPost ? () => setReplyRootId(threadRootId) : undefined}
        onEdit={
          canEditComment(comment, viewer)
            ? (body) => comments.edit(comment.id, body)
            : undefined
        }
        onDelete={canDeleteComment(comment, viewer) ? () => comments.remove(comment) : undefined}
      />
    );
  }

  return (
    <section className="comment-thread" aria-label={text.comments}>
      <h2>{text.comments}</h2>
      <ErrorNotice message={comments.error} retry={comments.reload} />
      {comments.threads.length === 0 && !comments.error ? (
        comments.loading ? <Loading /> : <Empty>{text.commentsEmpty}</Empty>
      ) : (
        <ol className="comment-thread-list">
          {comments.threads.map(({ root, replies }) => {
            // 単独で出た返信（ルートを読み込んでいない）も、自分のスレッドに返信する。
            const threadRootId = root.parentCommentId ?? root.id;
            return (
              <li key={root.id} className="comment-thread-group">
                {renderComment(root, threadRootId)}
                {(replies.length > 0 || replyRootId === threadRootId) && (
                  <div className="comment-replies">
                    {replies.map((reply) => renderComment(reply, threadRootId))}
                    {replyRootId === threadRootId && (
                      <CommentEditor
                        label={text.commentReply}
                        submitLabel={text.commentReply}
                        placeholder={text.commentReplyPlaceholder}
                        autoFocus
                        onSubmit={async (body) => {
                          await comments.post({ body, parentCommentId: threadRootId });
                          setReplyRootId(null);
                        }}
                        onCancel={() => setReplyRootId(null)}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {comments.hasMore && (
        <button
          type="button"
          className="button small"
          disabled={comments.loading}
          onClick={comments.loadMore}
        >
          {comments.loading ? text.loading : text.commentsLoadMore}
        </button>
      )}
      {canPost && (
        <CommentEditor
          label={text.comments}
          submitLabel={text.commentPost}
          placeholder={text.commentPlaceholder}
          onSubmit={(body) => comments.post({ body, parentCommentId: null })}
        />
      )}
    </section>
  );
}
