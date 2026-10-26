import { useId, useState } from 'react';
import type { AdminProject } from '@mmt/contracts';
import { adminProjectsApi } from '../../api/adminProjects';
import { useMutation } from '../../hooks/useMutation';
import { formatDate } from '../../lib/format';
import { Dialog } from '../Dialog';
import { ErrorNotice } from '../Feedback';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

/**
 * アーカイブしたProjectを完全に削除する。先にProjectの名前を入力させる。Run、モデル、
 * Artifactのファイルも一緒に消え、元に戻す方法が無いため。
 */
export function ProjectPurgeDialog({
  project,
  onPurged,
  onClose,
}: {
  project: AdminProject;
  onPurged: () => void;
  onClose: () => void;
}) {
  useLocale();
  const nameInputId = useId();
  const [typedName, setTypedName] = useState('');
  const mutation = useMutation();
  const isNameConfirmed = typedName === project.name;
  return (
    <Dialog
      title={text.projectPurgeTitle}
      onClose={onClose}
      dismissible={!mutation.pending}
      narrowLayout="sheet"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!isNameConfirmed) return;
          void mutation
            .run(async () => {
              await adminProjectsApi.purge(project.id);
              return true;
            })
            .then((purged) => {
              if (purged) onPurged();
            });
        }}
      >
        <p>{textTemplates.projectPurgeConfirm(project.name)}</p>
        {/* 名前だけでは、同じ名前の2つのProjectを見分けられない。 */}
        <p className="muted">
          {textTemplates.projectPurgeIdentity({
            createdAt: formatDate(project.createdAt),
            archivedAt: formatDate(project.archivedAt),
          })}
        </p>
        <div className="field">
          <label htmlFor={nameInputId}>{text.projectPurgeNameLabel}</label>
          <input
            id={nameInputId}
            value={typedName}
            autoComplete="off"
            placeholder={project.name}
            disabled={mutation.pending}
            onChange={(event) => setTypedName(event.target.value)}
          />
        </div>
        <ErrorNotice message={mutation.error} />
        <footer>
          <button type="button" className="button" onClick={onClose} disabled={mutation.pending}>
            {text.cancel}
          </button>
          <button className="button danger" disabled={!isNameConfirmed || mutation.pending}>
            {mutation.pending ? text.loading : text.projectPurge}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
