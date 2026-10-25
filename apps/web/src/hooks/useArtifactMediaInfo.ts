import type { Artifact, ArtifactMediaInfo } from '@mmt/contracts';
import { artifactMediaInfoApi } from '../api/artifactMediaInfo';
import { useQuery } from './useQuery';

/**
 * 1つのArtifactの、ヘッダーから読んだ音声の属性。読み込み中、サーバーが持っていないとき、要求が
 * 失敗したときはnull。デコードした値を補うだけなので、失敗は画面に出さない。
 */
export function useArtifactMediaInfo(artifact: Pick<Artifact, 'projectId' | 'id'>): ArtifactMediaInfo | null {
  const query = useQuery({ key: `${artifact.projectId}/${artifact.id}`, load: (signal) =>
    artifactMediaInfoApi.get(artifact.projectId, artifact.id, signal),
  });
  return query.value ?? null;
}
