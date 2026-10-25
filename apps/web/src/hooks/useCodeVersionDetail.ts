import { registryApi } from '../api/registry';
import { useQuery } from './useQuery';

/** One code version with its code (GET /code-versions/:id); off while there is no id. */
export function useCodeVersionDetail(projectId: string, codeVersionId: string | undefined) {
  return useQuery({ key: codeVersionId ? `${projectId}:code-version:${codeVersionId}` : null, load: (signal) =>
    registryApi.codeVersionDetail(projectId, codeVersionId!, signal),
  });
}
