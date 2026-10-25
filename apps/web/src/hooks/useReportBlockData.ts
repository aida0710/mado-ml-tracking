import type { ReportEmbedBlock, ReportRunSet, RunMediaKind } from '@mmt/contracts';
import { loadLiveBlockData, loadRunSetSample } from '../api/reportLiveData';
import { reportsApi } from '../api/reports';
import { runMediaApi } from '../api/runMedia';
import { sweepsApi } from '../api/sweeps';
import { trackingApi } from '../api/tracking';
import { getRunColumnNames } from '../components/runs/runColumnNames';
import { useQuery } from './useQuery';

/** 最新データの埋め込みの今のデータ。読む人の権限で読む。無ければnullを渡す。 */
export function useLiveBlockData(projectId: string, block: Exclude<ReportEmbedBlock, { type: 'media_table' }> | null) {
  return useQuery({ key: block ? `${projectId}:report-live:${JSON.stringify(block)}` : null, load: (signal) =>
    loadLiveBlockData(projectId, block!, signal),
  });
}

/** 対象のRunと、そのメトリクス・パラメータ・タグの名前。埋め込みを設定する間に候補として出す。 */
export function useRunSetFieldNames(projectId: string, runSet: ReportRunSet | null) {
  return useQuery({ key: runSet ? `${projectId}:report-run-set-names:${JSON.stringify(runSet)}` : null, load: async (signal) => {
    const runs = await loadRunSetSample(projectId, runSet!, signal);
    const tagKeys = [...new Set(runs.flatMap((run) => Object.keys(run.tags)))].sort();
    return { runs, ...getRunColumnNames(runs), tagKeys };
  } });
}

/** 対象のRunの元として、ピッカーが一覧のRunと検索のほかに出すもの。 */
export function useRunSetSources(projectId: string) {
  const savedViews = useQuery({ key: `${projectId}:report-saved-views`, load: (signal) => reportsApi.shareableSavedViews(projectId, signal) });
  const sweeps = useQuery({ key: `${projectId}:report-sweeps`, load: (signal) => sweepsApi.list(projectId, { signal }) });
  return { savedViews, sweeps };
}

// 表のキーが数個より多いstepを持つことはまれ。ピッカーはそのうち新しいものを出す。
const TABLE_MEDIA_PER_KEY = 50;

/** Runが記録した表（種類がtableのメディア）。そのどれかを埋め込むのに使う。 */
export function useRunTableMedia(projectId: string, runId: string) {
  return useQuery({ key: runId ? `${projectId}:report-table-media:${runId}` : null, load: async (signal) => {
    const keys = (await runMediaApi.keys(projectId, runId, signal)).filter((summary) => summary.kind === 'table');
    const pages = await Promise.all(
      keys.map((summary) => runMediaApi.page(projectId, runId, { key: summary.key, kind: 'table', limit: TABLE_MEDIA_PER_KEY }, signal)),
    );
    return pages.flatMap((page) => page.items);
  } });
}

/** 埋め込んだ表の出どころ。Runの名前と、表のキーとstep。 */
export function useMediaTableSource(projectId: string, target: { runId: string; mediaId: string }) {
  const { runId, mediaId } = target;
  const run = useQuery({ key: runId ? `${projectId}:run:${runId}` : null, load: (signal) => trackingApi.run(projectId, runId, signal) });
  const tables = useRunTableMedia(projectId, runId);
  const media = tables.value?.find((item) => item.id === mediaId);
  return run.value && media ? { runName: run.value.name, key: media.key, step: media.step } : null;
}

/** どのRunがその種類のメディアを記録したか。ピッカーが、1つも無いRunを外せるようにする。 */
export function useRunsWithMediaKind(projectId: string, runIds: string[], kind: RunMediaKind | undefined) {
  return useQuery({ key: kind && runIds.length > 0 ? `${projectId}:runs-with-media:${kind}:${runIds.join(',')}` : null, load: async (signal) => {
    const keysOfRuns = await Promise.all(runIds.map((runId) => runMediaApi.keys(projectId, runId, signal)));
    return new Set(runIds.filter((_runId, index) => keysOfRuns[index]!.some((summary) => summary.kind === kind)));
  } });
}

// 候補は検索1ページ分。名前で絞り込めば古いRunも見つかる。
const RUN_CANDIDATE_LIMIT = 50;

/** 名前で選ぶRunの候補。新しい順。 */
export function useRunCandidates(projectId: string, name: string) {
  const trimmed = name.trim();
  return useQuery({ key: `${projectId}:report-run-candidates:${trimmed}`, load: (signal) =>
    trackingApi.searchRuns(projectId, { ...(trimmed ? { name: trimmed } : {}), limit: RUN_CANDIDATE_LIMIT }, signal),
  });
}
