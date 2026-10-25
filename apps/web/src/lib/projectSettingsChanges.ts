import type { ArtifactBackend, Project, ProjectPatch, ProjectVisibility } from '@mmt/contracts';

/** 保存する前のProjectの設定フォームの値。 */
export interface ProjectSettingsDraft {
  description: string;
  visibility: ProjectVisibility;
  artifactBackend: ArtifactBackend;
}

/**
 * PATCHの本文。公開範囲と保存先は、変えたときだけ送る。無効にした保存先も、すでに使っている
 * Projectにとっては有効なままだから。
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
 * このフォームの外まで影響し、保存の前に確かめる変更。Projectを誰が開けるかと、新しいArtifactを
 * どこへ置くか（既存のものは動かない）。無ければnull。
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
