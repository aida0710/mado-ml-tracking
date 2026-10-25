import { registryApi } from '../api/registry';
import { useQuery } from './useQuery';

/** 1つのコードバージョンとそのコード（GET /code-versions/:id）。idが無い間は取得しない。 */
export function useCodeVersionDetail(projectId: string, codeVersionId: string | undefined) {
  return useQuery({ key: codeVersionId ? `${projectId}:code-version:${codeVersionId}` : null, load: (signal) =>
    registryApi.codeVersionDetail(projectId, codeVersionId!, signal),
  });
}
