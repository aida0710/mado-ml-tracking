import type { ArtifactBackend, Project, ProjectPatch, ProjectVisibility } from '@mmt/contracts';

/** What the Project settings form holds before saving. */
export interface ProjectSettingsDraft {
  description: string;
  visibility: ProjectVisibility;
  artifactBackend: ArtifactBackend;
}

/**
 * The PATCH body. Visibility and storage are sent only when changed: a disabled backend stays
 * valid for the Projects that already use it.
 */
export function buildProjectPatch(project: Project, draft: ProjectSettingsDraft): ProjectPatch {
  return {
    description: draft.description,
    ...(draft.artifactBackend !== project.artifactBackend
      ? { artifactBackend: draft.artifactBackend }
      : {}),
    ...(draft.visibility !== project.visibility ? { visibility: draft.visibility } : {}),
  };
}

/**
 * Changes that reach beyond this form and are asked about before saving: who may open the
 * Project, and where new Artifacts go while existing ones stay put. Null when there are none.
 */
export interface ProjectSettingsImpact {
  visibility?: ProjectVisibility;
  artifactBackend?: { from: ArtifactBackend; to: ArtifactBackend };
}

export function projectSettingsImpact(
  project: Project,
  patch: ProjectPatch,
): ProjectSettingsImpact | null {
  const impact: ProjectSettingsImpact = {
    ...(patch.visibility ? { visibility: patch.visibility } : {}),
    ...(patch.artifactBackend
      ? { artifactBackend: { from: project.artifactBackend, to: patch.artifactBackend } }
      : {}),
  };
  return impact.visibility || impact.artifactBackend ? impact : null;
}
