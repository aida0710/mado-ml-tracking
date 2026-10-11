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
import { text, textTemplates } from '../i18n/catalog';

const VISIBILITY_CHANGE_NOTICES: Record<ProjectVisibility, string> = {
  public: text.projectBecomesPublic,
  private: text.projectBecomesPrivate,
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
 * The Project's description, visibility and storage; only a Project admin changes them. Changing
 * who may open the Project or where new Artifacts go is confirmed first, since one click on
 * 保存 for the description would otherwise carry it along unnoticed.
 */
export function ProjectSettings() {
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
