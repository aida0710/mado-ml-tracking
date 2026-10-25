import type { ArtifactBackend, ProjectCreate, ProjectVisibility } from '@mmt/contracts';
import { toProjectMemberGrants, type MemberGrantDraft } from './projectMemberGrants';

// APIの既定値とも同じ。新しいProjectは、サインインできる全員に公開する。
export const DEFAULT_PROJECT_VISIBILITY: ProjectVisibility = 'public';

/**
 * 作成ダイアログから送るPOST /projectsの本文。メンバーは、その欄が出るPrivateのProjectのときだけ
 * 送る。空の説明は省く。
 */
export function buildProjectCreate({
  name,
  description,
  visibility,
  artifactBackend,
  memberDrafts,
}: {
  name: string;
  description: string;
  visibility: ProjectVisibility;
  artifactBackend: ArtifactBackend;
  memberDrafts: MemberGrantDraft[];
}): ProjectCreate {
  const trimmedDescription = description.trim();
  return {
    name: name.trim(),
    ...(trimmedDescription ? { description: trimmedDescription } : {}),
    artifactBackend,
    visibility,
    ...(visibility === 'private' && memberDrafts.length > 0
      ? { members: toProjectMemberGrants(memberDrafts) }
      : {}),
  };
}
