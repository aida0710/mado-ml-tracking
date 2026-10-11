import { registryApi } from '../api/registry';
import { findFamilyCodeVersions } from '../lib/codeVersionUsage';
import { useQuery } from './useQuery';

/** The Project's code versions that support a model family. Pass null to read nothing. */
export function useFamilyCodeVersions(projectId: string, family: string | null) {
  const catalog = useQuery(family ? `${projectId}:code-versions-by-code` : null, (signal) =>
    registryApi.codesWithVersions(projectId, signal),
  );
  return {
    items:
      family && catalog.value ? findFamilyCodeVersions({ family, ...catalog.value }) : undefined,
    error: catalog.error,
    reload: catalog.reload,
  };
}
