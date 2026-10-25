import { Component, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pin, Radio } from 'lucide-react';
import type { MediaTablePage, ReportBlock, ReportBlockSnapshot, ReportEmbedBlock, ReportSnapshotData } from '@mmt/contracts';
import { MarkdownView } from '../markdown/MarkdownView';
import { MetricsChart } from '../charts/MetricsChart';
import { ParallelCoordinatesChart } from '../analysis/ParallelCoordinatesChart';
import { ParameterImportanceTable } from '../analysis/ParameterImportanceTable';
import { ParamScatterChart } from '../analysis/ParamScatterChart';
import { MediaCompareGrid } from '../media/MediaCompareGrid';
import { MediaTableView } from '../media/MediaTableView';
import { MediaCell } from '../media/MediaCell';
import { RunTable } from '../runs/RunTable';
import { Empty, ErrorNotice, Loading } from '../Feedback';
import { useLiveBlockData, useMediaTableSource } from '../../hooks/useReportBlockData';
import { useExclusiveAudio } from '../../hooks/useExclusiveAudio';
import { CHART_ROW_HEIGHT_PX } from '../charts/ChartPanel';
import { formatDate } from '../../lib/format';
import { reportChartSeries, snapshotRunLabels } from '../../lib/reportBlocks';
import { analysisRows, metricFieldKey, metricFields, paramFieldKey, paramFields } from '../../lib/runAnalysisFields';
import { useLocale } from '../../i18n/useLocale';
import { reportBlockTypeLabels } from '../../i18n/reports';
import { text, textTemplates } from '../../i18n/catalog';

// レポートの中での図と分析の高さ。レポートはRunの一覧の図のグリッドより狭い。
const REPORT_CHART_HEIGHT_PX = 2 * CHART_ROW_HEIGHT_PX;
const REPORT_ANALYSIS_HEIGHT_PX = 360;

/**
 * 埋め込みのデータの出どころ。`preview`は編集画面用。保存したデータが無いか古い
 * スナップショットのブロックは、保存されるまで今のデータを描く。
 */
export interface ReportBlockViewProps {
  projectId: string;
  block: ReportBlock;
  snapshot: ReportBlockSnapshot | undefined;
  /** スナップショットの取得が失敗したか読み込み中。待つのはスナップショットのブロックだけ。 */
  snapshotState?: { loading: boolean; error: string | null; reload: () => void };
  preview?: boolean;
}

/** レポートの1ブロック。Markdownか、ほかの画面と同じ部品で描く埋め込み。 */
export function ReportBlockView({ projectId, block, snapshot, snapshotState, preview = false }: ReportBlockViewProps) {
  useLocale();
  if (block.type === 'markdown')
    return (
      <div className="report-markdown">
        <MarkdownView source={block.text} />
      </div>
    );
  const drawsSnapshot = block.mode === 'snapshot' && (snapshot !== undefined || !preview);
  return (
    <figure className="report-embed" data-block-type={block.type}>
      <figcaption className="report-embed-header">
        <span className="report-embed-type">{reportBlockTypeLabels[block.type]}</span>
        {block.type === 'media_table' && <MediaTableSource projectId={projectId} block={block} />}
        <EmbedModeMark block={block} snapshot={drawsSnapshot ? snapshot : undefined} />
      </figcaption>
      <BlockErrorBoundary key={JSON.stringify(block)}>
        {drawsSnapshot ? (
          snapshot ? (
            <EmbedContent projectId={projectId} block={block} data={snapshot.data} />
          ) : snapshotState?.error ? (
            <ErrorNotice message={snapshotState.error} retry={snapshotState.reload} />
          ) : snapshotState?.loading ? (
            <Loading />
          ) : (
            <Empty>{text.reportSnapshotMissing}</Empty>
          )
        ) : block.type === 'media_table' ? (
          <MediaTableView projectId={projectId} runId={block.runId} mediaId={block.mediaId} />
        ) : (
          <LiveEmbed projectId={projectId} block={block} />
        )}
      </BlockErrorBoundary>
    </figure>
  );
}

/** 埋め込んだ表のRunとstep。スナップショットの表の行だけでは、どれのものか分からない。 */
function MediaTableSource({ projectId, block }: { projectId: string; block: Extract<ReportEmbedBlock, { type: 'media_table' }> }) {
  useLocale();
  const source = useMediaTableSource(projectId, block);
  if (!source) return null;
  return (
    <span className="report-embed-source" data-testid="report-media-table-source">
      {textTemplates.reportMediaTableSource(source.runName, source.key, source.step)}
    </span>
  );
}

function EmbedModeMark({ block, snapshot }: { block: ReportEmbedBlock; snapshot: ReportBlockSnapshot | undefined }) {
  useLocale();
  if (block.mode === 'live')
    return (
      <span className="status-badge status-accent" data-testid="report-live-mark">
        <Radio size={13} />
        {text.reportModeLive}
      </span>
    );
  return (
    <span className="status-badge status-neutral" data-testid="report-snapshot-mark">
      <Pin size={13} />
      {snapshot ? textTemplates.reportSnapshotAt(formatDate(snapshot.capturedAt)) : text.reportSnapshotPending}
    </span>
  );
}

function LiveEmbed({ projectId, block }: { projectId: string; block: Exclude<ReportEmbedBlock, { type: 'media_table' }> }) {
  useLocale();
  const data = useLiveBlockData(projectId, block);
  if (data.error)
    return (
      <div className="report-embed-error">
        <strong>{text.reportEmbedError}</strong>
        <ErrorNotice message={data.error} retry={data.reload} />
      </div>
    );
  if (!data.value) return <Loading />;
  return <EmbedContent projectId={projectId} block={block} data={data.value} />;
}

/** 保存したデータか今のデータを描く。種類の違うデータ（その後に編集したブロック）は描かない。 */
function EmbedContent({ projectId, block, data }: { projectId: string; block: ReportEmbedBlock; data: ReportSnapshotData }) {
  useLocale();
  const navigate = useNavigate();
  const runPath = (runId: string) => `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`;
  if (block.type !== data.type) return <Empty>{text.reportSnapshotMissing}</Empty>;
  switch (data.type) {
    case 'chart': {
      if (block.type !== 'chart') return null;
      const { panel } = block;
      return (
        <div className="report-chart">
          {panel.title && <h3>{panel.title}</h3>}
          <MetricsChart
            series={reportChartSeries(data, panel.metricKeys)}
            xAxis={panel.xAxis}
            yScale={panel.yScale}
            smoothing={panel.smoothing}
            showRange={panel.showRange}
            showRaw={panel.smoothing.kind !== 'none'}
            height={REPORT_CHART_HEIGHT_PX}
          />
        </div>
      );
    }
    case 'parallel_coordinates': {
      if (block.type !== 'parallel_coordinates') return null;
      const params = paramFields(data.table);
      const metricKey = metricFieldKey(block.metric);
      const axes = [
        ...(block.params ?? []).flatMap((param) => params.find((field) => field.key === paramFieldKey(param)) ?? []),
        ...metricFields(data.table, text.analysisSweepObjective).filter((field) => field.key === metricKey),
      ];
      return (
        <ParallelCoordinatesChart
          rows={analysisRows(data.table)}
          axes={axes}
          colorAxisKey={metricKey}
          height={REPORT_ANALYSIS_HEIGHT_PX}
        />
      );
    }
    case 'parameter_importance':
      return <ParameterImportanceTable result={data.importance} />;
    case 'scatter': {
      if (block.type !== 'scatter') return null;
      return (
        <ParamScatterChart
          rows={analysisRows(data.table)}
          fields={[...paramFields(data.table), ...metricFields(data.table, text.analysisSweepObjective)]}
          defaultX={block.x}
          defaultY={block.y}
          defaultColor={block.color}
          onRunClick={(runId) => navigate(runPath(runId))}
          height={REPORT_ANALYSIS_HEIGHT_PX}
        />
      );
    }
    case 'run_table': {
      if (block.type !== 'run_table') return null;
      return (
        <RunTable
          projectId={projectId}
          runs={data.runs}
          columns={block.columns.map((key) => ({ key }))}
          // 列は保存したレポートのもの。変えるのは編集画面の選択で、表ではない。
          onColumnsChange={() => undefined}
          selectedIds={[]}
          onSelectedIdsChange={() => undefined}
        />
      );
    }
    case 'media':
      return <MediaCompareGrid projectId={projectId} grid={data.grid} runLabels={snapshotRunLabels(data.runs)} />;
    case 'media_table':
      return <SnapshotMediaTable projectId={projectId} page={data.page} />;
  }
}

/** 保存したときのままの表の最初のページ。セルは変わらないArtifactを指したまま。 */
function SnapshotMediaTable({ projectId, page }: { projectId: string; page: MediaTablePage }) {
  useLocale();
  const exclusiveAudio = useExclusiveAudio();
  return (
    <div className="media-table">
      <div className="media-table-toolbar">
        <span>{textTemplates.mediaTableRowCount(page.totalRows)}</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="mono">#</th>
              {page.columns.map((column) => (
                <th key={column.name}>{column.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="mono muted">{page.offset + rowIndex + 1}</td>
                {page.columns.map((column, columnIndex) => (
                  <td key={column.name}>
                    <MediaCell
                      projectId={projectId}
                      column={column}
                      value={row[columnIndex]}
                      playback={{ exclusiveAudio, cellId: `${rowIndex}:${columnIndex}` }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 1つの埋め込みの失敗で、レポートのほかの部分まで落ちないようにする。 */
class BlockErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <ErrorNotice message={text.reportEmbedRenderError} />;
    return this.props.children;
  }
}
