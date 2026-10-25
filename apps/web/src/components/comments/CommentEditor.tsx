import { useState } from 'react';
import { COMMENT_MAX_LENGTH } from '@mmt/contracts';
import { MarkdownEditor } from '../markdown/MarkdownEditor';
import { ErrorNotice } from '../Feedback';
import { useMutation } from '../../hooks/useMutation';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/**
 * 新しいコメント、返信、編集を書く。本文は送る前にAPIの決まり（空白だけでない、長さは
 * COMMENT_MAX_LENGTHまで）に照らして確かめる。
 */
export function CommentEditor({
  label,
  submitLabel,
  initialBody = '',
  placeholder,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  initialBody?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<unknown>;
  onCancel?: () => void;
}) {
  useLocale();
  const [body, setBody] = useState(initialBody);
  const [showsRequired, setShowsRequired] = useState(false);
  const mutation = useMutation();
  const isOverLimit = body.length > COMMENT_MAX_LENGTH;
  return (
    <form
      className="comment-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (!body.trim()) {
          setShowsRequired(true);
          return;
        }
        if (isOverLimit) return;
        void mutation
          .run(async () => {
            await onSubmit(body);
            return true;
          })
          .then((isSaved) => {
            if (isSaved) setBody('');
          });
      }}
    >
      <MarkdownEditor
        label={label}
        value={body}
        onChange={(value) => {
          setBody(value);
          setShowsRequired(false);
        }}
        maxLength={COMMENT_MAX_LENGTH}
        placeholder={placeholder}
        rows={4}
        autoFocus={autoFocus}
      />
      <ErrorNotice message={showsRequired ? text.commentBodyRequired : mutation.error} />
      <div className="comment-editor-actions">
        {onCancel && (
          <button type="button" className="button small" onClick={onCancel} disabled={mutation.pending}>
            {text.cancel}
          </button>
        )}
        <button className="button small primary" disabled={mutation.pending || isOverLimit}>
          {mutation.pending ? text.loading : submitLabel}
        </button>
      </div>
    </form>
  );
}
