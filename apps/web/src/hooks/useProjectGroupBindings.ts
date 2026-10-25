import type { ProjectRole } from '@mmt/contracts';
import { accessApi } from '../api/access';
import { explainLastProjectAdminConflict } from '../lib/lastProjectAdminConflict';
import { useQuery } from './useQuery';

/** ProjectのAuthentik groupの割り当てと、Project adminができる変更。 */
export function useProjectGroupBindings(projectId: string) {
  const bindings = useQuery({ key: `${projectId}:group-bindings`, load: (signal) =>
    accessApi.groupBindings(projectId, signal),
  });
  return {
    bindings,
    saveGroupBinding: (group: string, role: ProjectRole) =>
      explainLastProjectAdminConflict(accessApi.saveGroupBinding(projectId, group, role)),
    removeGroupBinding: (group: string) =>
      explainLastProjectAdminConflict(accessApi.removeGroupBinding(projectId, group)),
  };
}

/**
 * 割り当てを追加するときに出すgroup名。候補は補助にすぎないので、問い合わせに失敗しても
 * 一覧が空になるだけで、名前は入力できる。
 */
export function useGroupNameCandidates(): string[] {
  const groups = useQuery({ key: 'auth-groups', load: accessApi.groups });
  return groups.value ?? [];
}
