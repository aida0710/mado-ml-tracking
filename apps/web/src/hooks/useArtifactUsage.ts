import { artifactLifecycleApi } from '../api/artifactLifecycle';
import { useQuery } from './useQuery';

/** Projectの保存先ごとの、保存済みのArtifactのバイト数。 */
export function useArtifactUsage(projectId: string) {
  return useQuery({ key: `${projectId}:artifact-usage`, load: (signal) =>
    artifactLifecycleApi.usage(projectId, signal),
  });
}
