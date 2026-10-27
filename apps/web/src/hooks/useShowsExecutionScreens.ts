import { useProjectTargets } from './useProjectTargets';

/**
 * そのProjectで、Jobを動かす機能の画面（Sweeps・Tasks・Code・Workflows・Jobs・Hooks・使える
 * コンピュータと、Modelsの自動実行・昇格・Aliasの保護）を出すか。Jobを動かせるコンピュータが1台も
 * 無いProjectではどれも使えないので出さない。読み込み中と、Projectを開いていないときも出さない。
 */
export function useShowsExecutionScreens(projectId: string | undefined): boolean {
  return (useProjectTargets(projectId).value?.length ?? 0) > 0;
}
