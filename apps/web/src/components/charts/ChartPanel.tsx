import { useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Move,
  Settings2,
  Trash2,
} from 'lucide-react';
import type { ChartXAxis, MetricXRange } from '@mmt/contracts';
import { MetricsChart } from './MetricsChart';
import type { ChartPanelProps, MetricsChartMarker, MetricsChartSeries } from './chartProps';
import {
  ChartPanelEditor,
  type ChartGroupingOptions,
  type ChartPanelViewSettings,
} from './ChartPanelEditor';
import { ErrorNotice, Loading } from '../Feedback';
import { useChartPanelData, type ChartPlanData } from '../../hooks/useChartPanelData';
import type { QueryState } from '../../hooks/useQuery';
import { chartRequestPlanId, planChartRequests } from '../../lib/chartPanelRequests';
import {
  PANEL_HEIGHTS,
  PANEL_WIDTHS,
  type PanelHeight,
  type PanelMoveDirection,
  type PanelWidth,
} from '../../lib/chartPanelLayout';
import { groupChartSeries, runChartSeries, seriesForMetricKeys } from '../../lib/metricSeries';
import { chartValueUnit } from '../../lib/systemMetricKeys';
import { detailsPopoverHandlers } from '../../lib/detailsPopover';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';
import { formatList } from '../../i18n/textJoining';

/** Height of one grid row; a panel spans PANEL_HEIGHTS rows. */
export const CHART_ROW_HEIGHT_PX = 150;
/** Header, padding, and the chart's legend and footer line around its plot area. */
const PANEL_CHROME_PX = 110;
const DEFAULT_VIEW_SETTINGS: ChartPanelViewSettings = { xScale: 'linear', showRaw: true };

const widthLabels: Record<PanelWidth, string> = {
  get third() { return text.chartWidthThird; },
  get half() { return text.chartWidthHalf; },
  get full() { return text.chartWidthFull; },
};
const getMoveButtons = (): Array<[PanelMoveDirection, string, typeof ArrowUp]> => [
  ['up', text.moveChartUp, ArrowUp],
  ['down', text.moveChartDown, ArrowDown],
  ['left', text.moveChartLeft, ArrowLeft],
  ['right', text.moveChartRight, ArrowRight],
];

/** Placement controls; absent where the page fixes the panels (system metrics). */
export interface ChartPanelPlacement {
  onMove: (direction: PanelMoveDirection) => void;
  onResize: (size: { width?: PanelWidth; height?: PanelHeight }) => void;
}

export interface ChartPanelViewProps extends ChartPanelProps {
  /** The grid's shared response; without it (or while zoomed) the panel fetches its own. */
  shared?: QueryState<Record<string, ChartPlanData>>;
  search?: Parameters<typeof useChartPanelData>[0]['source']['search'];
  /** Metric keys offered by the editor and the metric x axis. */
  metricKeys: readonly string[];
  /** Offered in the editor; implies groupingEnabled. */
  grouping?: ChartGroupingOptions;
  /** Whether the stored grouping is drawn; false draws each Run (a single Run). */
  groupingEnabled?: boolean;
  markersFor?: (xAxis: ChartXAxis) => MetricsChartMarker[];
  /** Multiplier per metric key, such as MLflow megabytes to bytes. */
  valueScale?: (key: string) => number;
  placement?: ChartPanelPlacement;
}

/** One chart of the grid: its header with the panel actions, and the chart of its metrics. */
export function ChartPanel({
  projectId,
  config,
  runIds,
  runLabels = {},
  live = false,
  onConfigChange,
  onRemove,
  shared,
  search,
  metricKeys,
  grouping,
  groupingEnabled = grouping !== undefined,
  markersFor,
  valueScale,
  placement,
}: ChartPanelViewProps) {
  useLocale();
  const [view, setView] = useState(DEFAULT_VIEW_SETTINGS);
  const [zoom, setZoom] = useState<MetricXRange | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const planId = chartRequestPlanId(config, groupingEnabled);
  const ownFetch = zoom !== null || shared === undefined;
  const own = useChartPanelData({
    projectId,
    source: { runIds, ...(search ? { search } : {}) },
    plans: ownFetch ? planChartRequests([config], groupingEnabled) : [],
    ...(zoom ? { xRange: zoom } : {}),
    live,
  });
  const query = ownFetch ? own : shared!;
  // While a zoomed range loads, the chart keeps drawing the lines it had: in place of a loading
  // line it would be unmounted and forget its zoom, with no way to reset it.
  const [lastDrawn, setLastDrawn] = useState<{ planId: string; data: ChartPlanData } | null>(null);
  const fetched = query.value?.[planId];
  if (fetched && (lastDrawn?.planId !== planId || lastDrawn.data !== fetched))
    setLastDrawn({ planId, data: fetched });
  const data =
    fetched ?? (query.loading && lastDrawn?.planId === planId ? lastDrawn.data : undefined);
  const title = config.title || formatList(config.metricKeys);
  const chartHeight = config.layout.h * CHART_ROW_HEIGHT_PX - PANEL_CHROME_PX;
  const currentWidth = (Object.keys(PANEL_WIDTHS) as PanelWidth[]).find(
    (width) => PANEL_WIDTHS[width] === config.layout.w,
  );
  const isTall = config.layout.h >= PANEL_HEIGHTS.tall;

  return (
    <article className="chart-panel" aria-label={title}>
      <header className="chart-panel-header">
        <h3 title={title}>{title}</h3>
        <div className="chart-panel-actions">
          {placement && (
            <details className="chart-panel-placement" {...detailsPopoverHandlers}>
              <summary className="icon-button" aria-label={text.chartLayoutActions} title={text.chartLayoutActions}>
                <Move size={15} />
              </summary>
              <div className="chart-placement-menu">
                <div className="chart-move-buttons">
                  {getMoveButtons().map(([direction, label, Icon]) => (
                    <button
                      key={direction}
                      type="button"
                      className="icon-button"
                      aria-label={label}
                      title={label}
                      onClick={() => placement.onMove(direction)}
                    >
                      <Icon size={15} />
                    </button>
                  ))}
                </div>
                <div className="chart-size-buttons" role="group" aria-label={text.chartLayoutActions}>
                  {(Object.keys(PANEL_WIDTHS) as PanelWidth[]).map((width) => (
                    <button
                      key={width}
                      type="button"
                      className={`button small ${currentWidth === width ? 'active' : ''}`}
                      aria-pressed={currentWidth === width}
                      onClick={() => placement.onResize({ width })}
                    >
                      {widthLabels[width]}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`button small ${isTall ? 'active' : ''}`}
                    aria-pressed={isTall}
                    onClick={() => placement.onResize({ height: isTall ? 'normal' : 'tall' })}
                  >
                    {text.chartHeightTall}
                  </button>
                </div>
              </div>
            </details>
          )}
          {onConfigChange && (
            <button
              type="button"
              className="icon-button"
              aria-label={text.editChart}
              title={text.editChart}
              onClick={() => setIsEditing(true)}
            >
              <Settings2 size={15} />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              className="icon-button"
              aria-label={text.removeChart}
              title={text.removeChart}
              onClick={onRemove}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </header>
      {query.error ? (
        <ErrorNotice message={query.error} retry={query.reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <MetricsChart
          series={toChartSeries(data, config.metricKeys, runLabels, valueScale)}
          styleIds={runIds}
          xAxis={config.xAxis}
          xScale={view.xScale}
          yScale={config.yScale}
          valueUnit={chartValueUnit(config.metricKeys)}
          smoothing={config.smoothing}
          showRange={config.showRange}
          showRaw={view.showRaw}
          markers={markersFor?.(config.xAxis) ?? []}
          height={chartHeight}
          onZoom={setZoom}
        />
      )}
      {isEditing && onConfigChange && (
        <ChartPanelEditor
          dialogTitle={text.editChart}
          initial={{ panel: config, view }}
          metricKeys={metricKeys}
          grouping={grouping}
          onClose={() => setIsEditing(false)}
          onSave={(draft) => {
            setIsEditing(false);
            setView(draft.view);
            setZoom(null);
            onConfigChange({ ...draft.panel, id: config.id, layout: config.layout });
          }}
        />
      )}
    </article>
  );
}

/** Lines of one panel (lib/metricSeries seriesForMetricKeys), scaled to the unit of the panel. */
function toChartSeries(
  data: ChartPlanData,
  keys: readonly string[],
  runLabels: Readonly<Record<string, string>>,
  valueScale: ((key: string) => number) | undefined,
): MetricsChartSeries[] {
  return seriesForMetricKeys(keys, (key) => {
    const lines =
      data.kind === 'series' ? runChartSeries(data.series, key, runLabels) : groupChartSeries(data.groups, key);
    const scale = valueScale?.(key) ?? 1;
    return lines.map((line) => ({
      ...line,
      points:
        scale === 1
          ? line.points
          : line.points.map((point) => ({
              x: point.x,
              value: point.value * scale,
              ...(point.min !== undefined ? { min: point.min * scale } : {}),
              ...(point.max !== undefined ? { max: point.max * scale } : {}),
            })),
    }));
  });
}
