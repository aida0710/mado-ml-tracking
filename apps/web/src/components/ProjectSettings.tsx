import { useState } from 'react';
import type { ArtifactBackend, ProjectPatch, ProjectVisibility } from '@mmt/contracts';
import { administrationApi } from '../api/administration';
import { useProject } from '../hooks/useProject';
import { useStorageBackendChoices } from '../hooks/useStorageBackends';
import { useMutation } from '../hooks/useMutation';
import { ConfirmDialog } from './ConfirmDialog';
import { ErrorNotice, Resource } from './Feedback';
import { ProjectVisibilityPicker } from './ProjectVisibilityPicker';
import { StorageBackendPicker } from './StorageBackendPicker';
import {
  buildProjectPatch,
  projectSettingsImpact,
  type ProjectSettingsImpact,
} from '../lib/projectSettingsChanges';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';
import { formatList } from '../i18n/textJoining';

const VISIBILITY_CHANGE_NOTICES: Record<ProjectVisibility, string> = {
  get public() { return text.projectBecomesPublic; },
  get private() { return text.projectBecomesPrivate; },
};

function describeImpact(impact: ProjectSettingsImpact): string {
  return [
    impact.visibility && VISIBILITY_CHANGE_NOTICES[impact.visibility],
    impact.artifactBackend &&
      textTemplates.projectStorageChange(impact.artifactBackend.from, impact.artifactBackend.to),
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Projectの説明、公開範囲、保存先。変えられるのはProject adminだけで、ほかの人にはだれに頼めばよいか
 * を伝える（`adminNames`。メンバーを読み込む間は分からない）。Projectを開ける人と新しいArtifactの
 * 保存先の変更は先に確かめる。そうしないと、説明のために「保存」を1回押しただけで、気づかないうちに
 * 一緒に変わってしまう。
 */
export function ProjectSettings({ adminNames }: { adminNames: readonly string[] | undefined }) {
  useLocale();
  const { project, isProjectAdmin, reloadProjects } = useProject();
  const [description, setDescription] = useState(project.description);
  const [visibility, setVisibility] = useState<ProjectVisibility>(project.visibility);
  const [backend, setBackend] = useState<ArtifactBackend>(project.artifactBackend);
  const [saved, setSaved] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState<{
    patch: ProjectPatch;
    impact: ProjectSettingsImpact;
  } | null>(null);
  const backends = useStorageBackendChoices();
  const mutation = useMutation();
  const savePatch = async (patch: ProjectPatch) => {
    await administrationApi.updateProject(project.id, patch);
    setSaved(true);
    reloadProjects();
  };
  return (
    <section className="settings-section project-settings">
      <h2>{text.project}</h2>
      {!isProjectAdmin && (
        <p className="muted">
          {textTemplates.projectSettingsAdminOnly(formatList(adminNames ?? []))}
        </p>
      )}
      <Resource query={backends}>
        {(choices) => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSaved(false);
              const patch = buildProjectPatch(project, {
                description,
                visibility,
                artifactBackend: backend,
              });
              const impact = projectSettingsImpact(project, patch);
              if (impact) setUnconfirmed({ patch, impact });
              else void mutation.run(() => savePatch(patch));
            }}
          >
            <fieldset disabled={!isProjectAdmin || mutation.pending}>
              <div className="field">
                <label htmlFor="project-description">{text.description}</label>
                <textarea
                  id="project-description"
                  value={description}
                  rows={3}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <ProjectVisibilityPicker
                name="project-visibility"
                value={visibility}
                onChange={setVisibility}
              />
              <StorageBackendPicker
                name="project-artifact-backend"
                choices={choices.items}
                defaultBackend={choices.defaultBackend}
                value={backend}
                onChange={setBackend}
              />
              <p className="muted">{text.projectStorageChangeHint}</p>
            </fieldset>
            <ErrorNotice message={mutation.error} />
            {saved && (
              <p className="notice success" role="status">
                {text.projectSaved}
              </p>
            )}
            {isProjectAdmin && (
              <button className="button primary" disabled={mutation.pending}>
                {text.save}
              </button>
            )}
          </form>
        )}
      </Resource>
      {unconfirmed && (
        <ConfirmDialog
          title={text.projectSettingsConfirmTitle}
          message={describeImpact(unconfirmed.impact)}
          confirmLabel={text.projectSettingsConfirmSave}
          onConfirm={() => savePatch(unconfirmed.patch)}
          onConfirmed={() => setUnconfirmed(null)}
          onClose={() => setUnconfirmed(null)}
        />
      )}
    </section>
  );
}
