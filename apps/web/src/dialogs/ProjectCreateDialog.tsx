import { useState } from 'react';
import type { Project, ProjectVisibility } from '@mmt/contracts';
import { administrationApi } from '../api/administration';
import { useStorageBackendChoices } from '../hooks/useStorageBackends';
import { useMutation } from '../hooks/useMutation';
import { QueryDialog } from '../components/QueryDialog';
import { Dialog } from '../components/Dialog';
import { ErrorNotice } from '../components/Feedback';
import { ProjectMemberGrantsField } from '../components/ProjectMemberGrantsField';
import { ProjectVisibilityPicker } from '../components/ProjectVisibilityPicker';
import { NewProjectStorageField } from '../components/NewProjectStorageField';
import type { StorageBackendChoice } from '../hooks/useStorageBackends';
import { buildProjectCreate, DEFAULT_PROJECT_VISIBILITY } from '../lib/projectCreateInput';
import type { MemberGrantDraft } from '../lib/projectMemberGrants';
import { isProjectNameTaken } from '../lib/projectNameCollisions';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * Projectを作る。名前、説明、公開範囲（Privateならメンバーも）と保存先を決める。Projectの切り替え、
 * 全体管理のProjectの一覧、Projectが無いときの画面は、どれもこの1つのダイアログを開く。
 * 作ったProjectは呼び出し側が開く。
 */
export function ProjectCreateDialog({
  existingNames,
  onClose,
  onCreated,
}: {
  /** 利用者に見えるProjectの名前。2つ目のProjectに同じ名前が付く前に警告するため。 */
  existingNames: readonly string[];
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  useLocale();
  const backends = useStorageBackendChoices();
  return (
    <QueryDialog title={text.newProject} onClose={onClose} query={backends}>
      {(choices) => (
        <ProjectCreateForm
          choices={choices.items}
          defaultBackend={choices.defaultBackend}
          existingNames={existingNames}
          onClose={onClose}
          onCreated={onCreated}
        />
      )}
    </QueryDialog>
  );
}

function ProjectCreateForm({
  choices,
  defaultBackend,
  existingNames,
  onClose,
  onCreated,
}: {
  choices: StorageBackendChoice[];
  defaultBackend: string;
  existingNames: readonly string[];
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  useLocale();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ProjectVisibility>(DEFAULT_PROJECT_VISIBILITY);
  const [memberDrafts, setMemberDrafts] = useState<MemberGrantDraft[]>([]);
  // 新しいProjectは、全体管理者が既定に選んだ保存先から始める。
  const [backend, setBackend] = useState(defaultBackend);
  const mutation = useMutation();
  // 拒まずに警告だけする。APIは同じ名前を許し、チームがわざと同じ名前を使うこともある。
  const isNameTaken = isProjectNameTaken(name, existingNames);
  return (
    <Dialog title={text.newProject} onClose={onClose} dismissible={!mutation.pending}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void mutation
            .run(() =>
              administrationApi.createProject(
                buildProjectCreate({
                  name,
                  description,
                  visibility,
                  artifactBackend: backend,
                  memberDrafts,
                }),
              ),
            )
            .then((project) => {
              if (project) onCreated(project);
            });
        }}
      >
        <fieldset disabled={mutation.pending}>
          <div className="field">
            <label htmlFor="new-project-name">
              {text.name}
              <span className="required" aria-hidden="true">
                {' '}
                *
              </span>
            </label>
            <input
              id="new-project-name"
              value={name}
              required
              aria-describedby={isNameTaken ? 'new-project-name-taken' : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {isNameTaken && (
              <p id="new-project-name-taken" className="suggestion-note warning">
                {text.projectNameTakenHint}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="new-project-description">{text.projectDescriptionOptional}</label>
            <textarea
              id="new-project-description"
              value={description}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <ProjectVisibilityPicker
            name="new-project-visibility"
            value={visibility}
            onChange={setVisibility}
          />
          {visibility === 'private' && (
            <ProjectMemberGrantsField drafts={memberDrafts} onChange={setMemberDrafts} />
          )}
          <NewProjectStorageField
            choices={choices}
            defaultBackend={defaultBackend}
            value={backend}
            onChange={setBackend}
          />
        </fieldset>
        <ErrorNotice message={mutation.error} />
        <footer>
          <button type="button" className="button" onClick={onClose} disabled={mutation.pending}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={mutation.pending}>
            {mutation.pending ? text.loading : text.create}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
