import { executionApi } from '../api/execution';
import { useQuery } from './useQuery';

/**
 * ProjectのJobが実行できるコンピュータ。コンピュータを選ぶすべての画面で使う。全体で使えるもの、
 * 自分のもの、Projectに共有されたもの（GET /targets?projectId=）。Projectを開いていなければ読まない。
 */
export function useProjectTargets(projectId: string | undefined) {
  return useQuery({ key: projectId ? `${projectId}:project-targets` : null, load: (signal) =>
    executionApi.projectTargets(projectId!, signal),
  });
}
