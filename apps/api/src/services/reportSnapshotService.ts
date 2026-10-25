import {
  DEFAULT_SERIES_POINTS,
  MAX_GROUPED_RUNS,
  MAX_SERIES_RUNS,
  MEDIA_TABLE_PAGE_MAX_ROWS,
  REPORT_SNAPSHOT_BLOCK_MAX_BYTES,
  type ReportChartBlock,
  type ReportEmbedBlock,
  type ReportRunSet,
  type ReportRunTableBlock,
  type ReportScatterBlock,
  type ReportSnapshotData,
  type RunSet,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import type { Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import { MAX_RESPONSE_POINTS } from '../domain/metricSeries/metricSeriesValidation.js';
import { scatterTableKeys } from '../domain/reportBlocks.js';
import { runSearchSchema } from '../routes/runSearchRoutes.js';
import {
  listSweepTrialRunIds,
  readRunNames,
  readRunSummaries,
} from '../repositories/reportRepository.js';
import { findSweepObjective } from '../repositories/runAnalysisRepository.js';
import { findSavedView } from '../repositories/savedViewRepository.js';
import type { MetricSeriesService } from './metricSeriesService.js';
import type { RunAnalysisService } from './runAnalysisService.js';
import type { RunMediaService } from './runMediaService.js';
import type { RunSearchConditions, RunSearchService } from './runSearchService.js';

const runSearchConditionsSchema = runSearchSchema.omit({ limit: true, cursor: true });

export interface ReportSnapshotSources {
  runSearch: RunSearchService;
  metricSeries: MetricSeriesService;
  runAnalysis: RunAnalysisService;
  runMedia: RunMediaService;
}

/** 分析のサービスが受け付ける形。保存ビューはその検索条件に変える。 */
type SearchableRunSet = Exclude<RunSet, { search: unknown }> | { search: RunSearchConditions };

interface CaptureRequest {
  principal: Principal;
  projectId: string;
}

function tooManyRuns(maxRuns: number): never {
  throw new DomainError({
    status: 422,
    code: 'too_many_runs',
    message: `a chart can pin at most ${maxRuns} runs; narrow down the runs`,
    details: { limit: maxRuns },
  });
}

/**
 * スナップショットのブロックを描くもとのデータを取る。最新データのブロックがブラウザから呼ぶのと
 * 同じサービスを、保存するeditorの権限で呼ぶ。ブロックごとの上限は
 * REPORT_SNAPSHOT_BLOCK_MAX_BYTES（413 report_snapshot_too_large）。
 */
export class ReportSnapshotService {
  constructor(
    private readonly database: Database,
    private readonly sources: ReportSnapshotSources,
  ) {}

  async capture(
    request: CaptureRequest,
    block: ReportEmbedBlock,
  ): Promise<{ data: ReportSnapshotData; sizeBytes: number }> {
    const data = await this.read(request, block);
    const sizeBytes = Buffer.byteLength(JSON.stringify(data));
    if (sizeBytes > REPORT_SNAPSHOT_BLOCK_MAX_BYTES)
      throw new DomainError({
        status: 413,
        code: 'report_snapshot_too_large',
        message: `the pinned data of block ${block.id} exceeds 5 MiB; narrow down the runs or series, or draw it with the latest data`,
        details: { blockId: block.id },
      });
    return { data, sizeBytes };
  }

  private async read(request: CaptureRequest, block: ReportEmbedBlock): Promise<ReportSnapshotData> {
    const { principal, projectId } = request;
    const { runAnalysis, runMedia } = this.sources;
    switch (block.type) {
      case 'chart':
        return this.readChart(request, block);
      case 'parallel_coordinates':
        return {
          type: block.type,
          table: await runAnalysis.readTable(principal, projectId, {
            runSet: await this.searchableRunSet(request, block.runSet),
            params: block.params,
            metrics: [block.metric],
          }),
        };
      case 'parameter_importance':
        return {
          type: block.type,
          importance: await runAnalysis.computeParameterImportance(principal, projectId, {
            runSet: await this.searchableRunSet(request, block.runSet),
            targetMetric: block.targetMetric,
          }),
        };
      case 'scatter':
        return this.readScatter(request, block);
      case 'run_table':
        return { type: block.type, runs: await this.readRunTable(request, block) };
      case 'media':
        return {
          type: block.type,
          runs: await readRunNames(this.database, { projectId, runIds: block.runIds }),
          grid: await runMedia.compare(principal, projectId, {
            runIds: block.runIds,
            key: block.key,
            steps: block.steps,
          }),
        };
      case 'media_table':
        return {
          type: block.type,
          page: await runMedia.table(
            principal,
            { projectId, runId: block.runId, mediaId: block.mediaId },
            { offset: 0, limit: MEDIA_TABLE_PAGE_MAX_ROWS },
          ),
        };
    }
  }

  private async readChart(
    request: CaptureRequest,
    block: ReportChartBlock,
  ): Promise<ReportSnapshotData> {
    const { principal, projectId } = request;
    const { panel } = block;
    const base = { keys: panel.metricKeys, xAxis: panel.xAxis, xRange: null };
    if (panel.groupBy) {
      const runIds = await this.resolveRunIds(request, block.runSet, MAX_GROUPED_RUNS);
      if (!runIds.length) return { type: 'chart', runs: [], groups: [] };
      const groups = await this.sources.metricSeries.readGroups(principal, projectId, {
        ...base,
        runIds,
        groupBy: panel.groupBy,
        maxPoints: DEFAULT_SERIES_POINTS,
      });
      const groupedRunIds = groups.groups.flatMap((group) => group.runIds);
      return {
        type: 'chart',
        runs: await readRunNames(this.database, { projectId, runIds: groupedRunIds }),
        groups: groups.groups,
      };
    }
    const runIds = await this.resolveRunIds(request, block.runSet, MAX_SERIES_RUNS);
    if (!runIds.length) return { type: 'chart', runs: [], series: [] };
    // Runやキーが多いときは、系列のエンドポイントが許す応答の量をそれらで分け合う。
    const maxPoints = Math.max(
      1,
      Math.min(
        DEFAULT_SERIES_POINTS,
        Math.floor(MAX_RESPONSE_POINTS / (runIds.length * panel.metricKeys.length)),
      ),
    );
    const { series } = await this.sources.metricSeries.readSeries(principal, projectId, {
      ...base,
      runIds,
      maxPoints,
    });
    return {
      type: 'chart',
      runs: await readRunNames(this.database, { projectId, runIds }),
      series,
    };
  }

  private async readScatter(
    request: CaptureRequest,
    block: ReportScatterBlock,
  ): Promise<ReportSnapshotData> {
    const { principal, projectId } = request;
    const keys = scatterTableKeys(block);
    let metrics = keys.metrics;
    // 目的メトリクスだけを描く場合。表にはメトリクスが要るので、目的メトリクスそのものを読む。
    if (!metrics.length && 'sweepId' in block.runSet) {
      const objective = await findSweepObjective(this.database, {
        projectId,
        sweepId: block.runSet.sweepId,
      });
      if (!objective) notFound('sweep');
      metrics = [objective.metric];
    }
    return {
      type: 'scatter',
      table: await this.sources.runAnalysis.readTable(principal, projectId, {
        runSet: await this.searchableRunSet(request, block.runSet),
        params: keys.params.length ? keys.params : undefined,
        metrics,
      }),
    };
  }

  /** 集合の先頭から`limit`件のRun。順は集合の順（検索なら検索の並び順）。 */
  private async readRunTable(request: CaptureRequest, block: ReportRunTableBlock) {
    const { principal, projectId } = request;
    const runSet = await this.searchableRunSet(request, block.runSet);
    if ('search' in runSet) {
      const page = await this.sources.runSearch.search(principal, projectId, {
        ...runSet.search,
        limit: block.limit,
        cursor: null,
      });
      return page.items;
    }
    const runIds =
      'runIds' in runSet
        ? runSet.runIds
        : await listSweepTrialRunIds(this.database, { projectId, sweepId: runSet.sweepId });
    return readRunSummaries(this.database, { projectId, runIds: runIds.slice(0, block.limit) });
  }

  /** 何にも一致しない検索では空の一覧を返す。 */
  private async resolveRunIds(
    request: CaptureRequest,
    reportRunSet: ReportRunSet,
    maxRuns: number,
  ): Promise<string[]> {
    const runSet = await this.searchableRunSet(request, reportRunSet);
    const runIds =
      'search' in runSet
        ? await this.sources.runSearch.collectRunIds(request.principal, request.projectId, {
            conditions: runSet.search,
            maxRuns,
          })
        : 'runIds' in runSet
          ? runSet.runIds
          : await listSweepTrialRunIds(this.database, {
              projectId: request.projectId,
              sweepId: runSet.sweepId,
            });
    if (runIds.length > maxRuns) tooManyRuns(maxRuns);
    return runIds;
  }

  /** 保存ビューはその検索条件に変え、検索には省かれた項目の既定値を補う。 */
  private async searchableRunSet(
    request: CaptureRequest,
    runSet: ReportRunSet,
  ): Promise<SearchableRunSet> {
    if ('search' in runSet) return { search: runSearchConditionsSchema.parse(runSet.search) };
    if (!('savedViewId' in runSet)) return runSet;
    const view = await findSavedView(this.database, {
      projectId: request.projectId,
      savedViewId: runSet.savedViewId,
    });
    // 保存のときにビューが共有されていることは確かめた。その後に非公開にされたビューは読まない。
    if (!view || view.visibility !== 'project') notFound('saved view');
    const { experimentIds, filter, orderBy, statuses, kinds } = view.state;
    return {
      search: runSearchConditionsSchema.parse({ experimentIds, filter, orderBy, statuses, kinds }),
    };
  }
}
