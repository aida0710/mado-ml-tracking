import type { Artifact } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { previousArtifactVersions } from '../lib/artifactTree';
import { useCursorPages } from './useCursorPages';
import { useQuery } from './useQuery';

// ディレクトリの1画面分。数千のファイルを持つRunでも、最初のページがすぐ出る。
export const RUN_ARTIFACT_PAGE_SIZE = 200;
// 同じパスへの保存し直しは少ない。これを超える古いアップロードもAPIからはたどれる。
const ARTIFACT_VERSION_LIMIT = 100;

/**
 * Runのディレクトリの1階層。件数付きのサブディレクトリと、ページごとのファイル。`revision`で、
 * アップロードの後に両方を読み直す。
 */
export function useRunArtifacts(
  location: { projectId: string; runId: string; prefix: string },
  revision: number,
) {
  const { projectId, runId, prefix } = location;
  const key = `${projectId}:${runId}:artifacts:${revision}:${prefix}`;
  const tree = useQuery({ key: `${key}:tree`, load: (signal) =>
    trackingApi.runArtifactTree(projectId, runId, prefix, signal),
  });
  const files = useCursorPages(`${key}:files`, (cursor, signal) =>
    trackingApi.runArtifactPage(
      projectId,
      runId,
      { prefix, directFilesOnly: true, limit: RUN_ARTIFACT_PAGE_SIZE, cursor },
      signal,
    ),
  );
  return { tree, files };
}

/** `artifact`のパスへの以前のアップロード。新しい順。 */
export function useArtifactVersions(artifact: Artifact | undefined) {
  const versions = useQuery({
    key: artifact?.runId ? `${artifact.runId}:artifact-versions:${artifact.id}` : null,
    load: (signal) =>
      trackingApi.runArtifactPage(
        artifact!.projectId,
        artifact!.runId!,
        { prefix: artifact!.path, versions: 'all', limit: ARTIFACT_VERSION_LIMIT },
        signal,
      ),
  });
  return {
    ...versions,
    value:
      artifact && versions.value
        ? previousArtifactVersions(versions.value.items, artifact)
        : undefined,
  };
}
