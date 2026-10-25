import type { ComputeTargetOverview } from '@mmt/contracts';
import { executionApi } from '../api/execution';
import { useMutation } from './useMutation';
import { useQuery } from './useQuery';

/**
 * 全体設定 → コンピュータ。すべてのコンピュータ（GET /targets/overview）と、利用者が使うか
 * 管理できるものの詳細（GET /targets）。変更の後は両方をまとめて読み直す。
 */
export function useComputers() {
  const overview = useQuery({ key: 'compute-target-overview', load: executionApi.targetOverview });
  const details = useQuery({ key: 'compute-targets', load: executionApi.targets });
  const mutation = useMutation();
  function reload() {
    overview.reload();
    details.reload();
  }
  function toggleEnabled(target: Pick<ComputeTargetOverview, 'id' | 'enabled'>) {
    void mutation
      .run(() => executionApi.updateTarget(target.id, { enabled: !target.enabled }))
      .then((saved) => {
        if (saved) reload();
      });
  }
  /** 利用者が開ける行の、コンピュータの全部の情報。GET /targetsの結果に入るまではundefined。 */
  const findDetails = (targetId: string | null) =>
    details.value?.find((target) => target.id === targetId);
  return { overview, findDetails, reload, toggleEnabled, mutation };
}
