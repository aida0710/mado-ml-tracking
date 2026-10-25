import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import type { ChartPanelLayout, ChartXAxis } from '@mmt/contracts';
import { CHART_ROW_HEIGHT_PX, ChartPanel } from './ChartPanel';
import type { MetricsChartMarker } from './chartProps';
import { ChartPanelEditor, type ChartGroupingOptions } from './ChartPanelEditor';
import { Empty } from '../Feedback';
import { useChartPanelData, type ChartRunSource } from '../../hooks/useChartPanelData';
import { planChartRequests } from '../../lib/chartPanelRequests';
import {
  addPanel,
  createPanelConfig,
  movePanel,
  removePanel,
  resizePanel,
  updatePanel,
} from '../../lib/chartPanelLayout';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/** レイアウトの中で一意。crypto.randomUUIDは素のhttpのオリジンには無い。 */
function createPanelId(): string {
  return `panel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** レイアウトに変更を当てる。結果をどこに保存するかはページが決める。 */
export type ChartLayoutChange = (change: (layout: ChartPanelLayout) => ChartPanelLayout) => void;

/**
 * 12列のグリッドに並べたパネル。ページの全パネルを、x軸とグループ化の組ごとに1回の要求で
 * 取得し、各パネルが自分のキーを描く。`onLayoutChange`が無ければパネルは固定だが、図の
 * ズームはできる。
 */
export function ChartPanelGrid({
  projectId,
  layout,
  source,
  runLabels,
  live,
  metricKeys,
  grouping,
  groupingEnabled = grouping !== undefined,
  markersFor,
  valueScale,
  onLayoutChange,
  onResetLayout,
  toolbar,
  emptyMessage,
}: {
  projectId: string;
  layout: ChartPanelLayout;
  source: ChartRunSource;
  runLabels: Readonly<Record<string, string>>;
  live: boolean;
  metricKeys: readonly string[];
  /** パネルの編集画面に出す。パネルごとに別のグループ化ができる。 */
  grouping?: ChartGroupingOptions;
  /** パネルごとの選択が無くても、保存したグループ化を描く（Runの一覧は全パネルに1つを設定する）。 */
  groupingEnabled?: boolean;
  markersFor?: (xAxis: ChartXAxis) => MetricsChartMarker[];
  valueScale?: (key: string) => number;
  onLayoutChange?: ChartLayoutChange;
  /** 利用者が既定を変えたときだけ出す。 */
  onResetLayout?: () => void;
  toolbar?: ReactNode;
  /** パネルが無いときに出す。既定では、Runにメトリクスがそもそもあるかどうかを伝える。 */
  emptyMessage?: string;
}) {
  useLocale();
  const [isAdding, setIsAdding] = useState(false);
  const headingId = useId();
  const shared = useChartPanelData({
    projectId,
    source,
    plans: planChartRequests(layout.panels, groupingEnabled),
    live,
  });
  const gridStyle = { '--chart-row-height': `${CHART_ROW_HEIGHT_PX}px` } as CSSProperties;

  return (
    <section className="chart-panel-area" aria-labelledby={headingId}>
      {/* パネルの見出しはh3。これでページのh1から見出しの階層が飛ばない。 */}
      <h2 id={headingId} className="sr-only">
        {text.charts}
      </h2>
      {(toolbar || onLayoutChange) && (
        <div className="chart-grid-toolbar">
          {toolbar}
          {onLayoutChange && (
            <div className="chart-grid-actions">
              {onResetLayout && (
                <button type="button" className="button small" onClick={onResetLayout}>
                  <RotateCcw size={14} />
                  {text.resetChartLayout}
                </button>
              )}
              <button
                type="button"
                className="button small"
                disabled={!metricKeys.length}
                onClick={() => setIsAdding(true)}
              >
                <Plus size={14} />
                {text.addChart}
              </button>
            </div>
          )}
        </div>
      )}
      {!source.runIds.length && !source.search ? (
        <Empty>{text.chartNoRuns}</Empty>
      ) : !layout.panels.length ? (
        <Empty>{emptyMessage ?? (metricKeys.length ? text.noChartPanels : text.noChartMetrics)}</Empty>
      ) : (
        <div className="chart-panel-grid" style={gridStyle}>
          {layout.panels.map((panel) => (
            <div
              key={panel.id}
              className="chart-panel-cell"
              style={{
                gridColumn: `${panel.layout.x + 1} / span ${panel.layout.w}`,
                gridRow: `${panel.layout.y + 1} / span ${panel.layout.h}`,
              }}
            >
              <ChartPanel
                projectId={projectId}
                config={panel}
                runIds={source.runIds}
                {...(source.search ? { search: source.search } : {})}
                runLabels={runLabels}
                live={live}
                shared={shared}
                metricKeys={metricKeys}
                {...(grouping ? { grouping } : {})}
                groupingEnabled={groupingEnabled}
                {...(markersFor ? { markersFor } : {})}
                {...(valueScale ? { valueScale } : {})}
                {...(onLayoutChange
                  ? {
                      onConfigChange: (config) =>
                        onLayoutChange((current) => updatePanel(current, panel.id, config)),
                      onRemove: () => onLayoutChange((current) => removePanel(current, panel.id)),
                      placement: {
                        onMove: (direction) =>
                          onLayoutChange((current) => movePanel(current, panel.id, direction)),
                        onResize: (size) =>
                          onLayoutChange((current) => resizePanel(current, panel.id, size)),
                      },
                    }
                  : {})}
              />
            </div>
          ))}
        </div>
      )}
      {isAdding && onLayoutChange && (
        <ChartPanelEditor
          dialogTitle={text.addChart}
          initial={{
            panel: createPanelConfig([]),
            view: { xScale: 'linear', showRaw: true },
          }}
          metricKeys={metricKeys}
          {...(grouping ? { grouping } : {})}
          onClose={() => setIsAdding(false)}
          onSave={({ panel }) => {
            setIsAdding(false);
            onLayoutChange((current) => addPanel(current, panel, { id: createPanelId() }));
          }}
        />
      )}
    </section>
  );
}
