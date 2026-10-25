import { useState } from 'react';
import type { Comment } from '@mmt/contracts';
import { MarkdownView } from '../markdown/MarkdownView';
import { ConfirmDialog } from '../ConfirmDialog';
import { CommentEditor } from './CommentEditor';
import { formatDate } from '../../lib/format';
import { formatRelativeTime } from '../../lib/relativeTime';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

/**
 * 1つのコメントと、その投稿者、時刻、閲覧者が行える操作。コールバックを省くとその操作を隠す。
 * 削除したコメントは場所を残し、"削除されました"と出す。
 */
export function CommentItem({
  comment,
  onReply,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  onReply?: () => void;
  onEdit?: (body: string) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
}) {
  useLocale();
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  return (
    <article className={comment.deleted ? 'comment-item deleted' : 'comment-item'} data-comment-id={comment.id}>
      <header className="comment-meta">
        <strong>{comment.author.displayName}</strong>
        <time dateTime={comment.createdAt} title={formatDate(comment.createdAt)}>
          {formatRelativeTime(comment.createdAt)}
        </time>
        {comment.editedAt && !comment.deleted && (
          <span className="muted" title={textTemplates.commentEditedAt(formatDate(comment.editedAt))}>
            {text.commentEdited}
          </span>
        )}
      </header>
      {comment.deleted || comment.body === null ? (
        <p className="comment-deleted muted">{text.commentDeleted}</p>
      ) : isEditing && onEdit ? (
        <CommentEditor
          label={text.commentEdit}
          submitLabel={text.save}
          initialBody={comment.body}
          autoFocus
          onSubmit={async (body) => {
            await onEdit(body);
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <MarkdownView source={comment.body} />
      )}
      {!isEditing && (onReply || onEdit || onDelete) && (
        <div className="comment-actions" aria-label={text.commentActions}>
          {onReply && (
            <button type="button" className="link-button" onClick={onReply}>
              {text.commentReply}
            </button>
          )}
          {onEdit && (
            <button type="button" className="link-button" onClick={() => setIsEditing(true)}>
              {text.commentEdit}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="link-button danger"
              onClick={() => setIsConfirmingDelete(true)}
            >
              {text.commentDelete}
            </button>
          )}
        </div>
      )}
      {isConfirmingDelete && onDelete && (
        <ConfirmDialog
          title={text.commentDeleteTitle}
          message={text.commentDeleteMessage}
          confirmLabel={text.commentDelete}
          destructive
          onConfirm={onDelete}
          onConfirmed={() => setIsConfirmingDelete(false)}
          onClose={() => setIsConfirmingDelete(false)}
        />
      )}
    </article>
  );
}
