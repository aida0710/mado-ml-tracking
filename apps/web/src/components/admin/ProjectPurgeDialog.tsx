import { useId, useState } from 'react';
import type { AdminProject } from '@mmt/contracts';
import { adminProjectsApi } from '../../api/adminProjects';
import { useMutation } from '../../hooks/useMutation';
import { explainProjectLifecycleConflict } from '../../lib/projectLifecycleConflict';
import { formatDate } from '../../lib/format';
import { Dialog } from '../Dialog';
import { ErrorNotice } from '../Feedback';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

/**
 * Purges an archived Project for good. The Project's name must be typed first, because the Runs,
 * models and Artifact files go with it and nothing brings them back.
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
              await explainProjectLifecycleConflict(adminProjectsApi.purge(project.id));
              return true;
            })
            .then((purged) => {
              if (purged) onPurged();
            });
        }}
      >
        <p>{textTemplates.projectPurgeConfirm(project.name)}</p>
        {/* The name alone cannot tell two Projects of the same name apart. */}
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
