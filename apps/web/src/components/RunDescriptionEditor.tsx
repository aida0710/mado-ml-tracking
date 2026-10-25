import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { RUN_NOTE_MAX_LENGTH, RUN_NOTE_TAG } from '@mmt/contracts';
import type { RunDescriptionEditorProps } from './charts/chartProps';
import { runNotesApi } from '../api/runNotes';
import { useMutation } from '../hooks/useMutation';
import { useProject } from '../hooks/useProject';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { MarkdownEditor } from './markdown/MarkdownEditor';
import { MarkdownView } from './markdown/MarkdownView';
import { Empty, ErrorNotice } from './Feedback';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * RunのMarkdownの説明。MLflowのタグmlflow.note.contentそのものなので、MLflowのクライアントから
 * 書いた説明がここに出て、ここで保存した説明をMLflowが読む。
 */
export function RunDescriptionEditor({ projectId, run }: RunDescriptionEditorProps) {
  useLocale();
  const { canEdit } = useProject();
  const runContent = run.tags[RUN_NOTE_TAG] ?? '';
  // この画面で保存した内容を、置き換えたタグの値と組にして覚えておく。ページがRunを読み直した後は、
  // タグそのものの方が新しい答えになる。
  const [saved, setSaved] = useState<{ replacedContent: string; content: string } | null>(null);
  const content = saved && saved.replacedContent === runContent ? saved.content : runContent;
  const [isEditing, setIsEditing] = useState(false);
  return (
    <section className="run-description">
      <div className="run-description-header">
        <h2>{text.runDescription}</h2>
        {canEdit && !isEditing && (
          <button type="button" className="button small" onClick={() => setIsEditing(true)}>
            <Pencil size={14} />
            {text.runDescriptionEdit}
          </button>
        )}
      </div>
      {isEditing ? (
        <RunDescriptionForm
          initialContent={content}
          save={(nextContent) => runNotesApi.update(projectId, run.id, { content: nextContent })}
          onSaved={(nextContent) => {
            setSaved({ replacedContent: runContent, content: nextContent });
            setIsEditing(false);
          }}
          onClose={() => setIsEditing(false)}
        />
      ) : content.trim() ? (
        <MarkdownView source={content} />
      ) : (
        <Empty>{text.runDescriptionEmpty}</Empty>
      )}
    </section>
  );
}

function RunDescriptionForm({
  initialContent,
  save,
  onSaved,
  onClose,
}: {
  initialContent: string;
  save: (content: string) => Promise<{ content: string }>;
  onSaved: (content: string) => void;
  onClose: () => void;
}) {
  useLocale();
  const [draft, setDraft] = useState(initialContent);
  const mutation = useMutation();
  const isOverLimit = draft.length > RUN_NOTE_MAX_LENGTH;
  const unsaved = useUnsavedChanges(draft !== initialContent, mutation.pending, {
    onNavigationDiscard: onClose,
  });
  // 確認のダイアログはフォームの兄弟に置く。中に置くと、ダイアログのボタンとイベントがフォームの
  // 送信に届き、利用者が捨てようとしている下書きを保存してしまう。
  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // APIは422を返すので、ここで止めて下書きを残し、理由を伝える。
          if (isOverLimit) return;
          void mutation.run(() => save(draft)).then((note) => {
            if (note) onSaved(note.content);
          });
        }}
      >
        <MarkdownEditor
          label={text.runDescription}
          value={draft}
          onChange={setDraft}
          maxLength={RUN_NOTE_MAX_LENGTH}
          placeholder={text.runDescriptionPlaceholder}
          autoFocus
        />
        <ErrorNotice message={mutation.error} />
        <div className="comment-editor-actions">
          <button
            type="button"
            className="button small"
            disabled={mutation.pending}
            onClick={() => unsaved.requestAction(onClose)}
          >
            {text.cancel}
          </button>
          <button className="button small primary" disabled={mutation.pending || isOverLimit}>
            {mutation.pending ? text.loading : text.save}
          </button>
        </div>
      </form>
      {unsaved.confirmingDiscard && (
        <UnsavedChangesDialog onDiscard={unsaved.discard} onKeepEditing={unsaved.keepEditing} />
      )}
    </>
  );
}
