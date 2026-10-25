import { registryApi } from '../api/registry';
import { findFamilyCodeVersions } from '../lib/codeVersionUsage';
import { useQuery } from './useQuery';

/** モデル系列に対応するProjectのコードバージョン。nullを渡すと何も読まない。 */
export function useFamilyCodeVersions(projectId: string, family: string | null) {
  const catalog = useQuery({ key: family ? `${projectId}:code-versions-by-code` : null, load: (signal) =>
    registryApi.codesWithVersions(projectId, signal),
  });
  return {
    items:
      family && catalog.value ? findFamilyCodeVersions({ family, ...catalog.value }) : undefined,
    error: catalog.error,
    reload: catalog.reload,
  };
}
