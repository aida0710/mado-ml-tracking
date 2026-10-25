import { useId, useState } from 'react';
import type { RunGroupBy } from '@mmt/contracts';
import { Dialog } from '../Dialog';
import { ChartControls } from './ChartControls';
import type { ChartDisplaySettings } from './chartProps';
import { RunGroupingControl } from './RunGroupingControl';
import { isCompleteGrouping } from '../../lib/runGrouping';
import { MAX_PANEL_METRIC_KEYS, type NewChartPanel } from '../../lib/chartPanelLayout';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

/** 保存するパネルの設定に含まれない、パネルの表示設定。 */
export type ChartPanelViewSettings = Pick<ChartDisplaySettings, 'xScale' | 'showRaw'>;

export interface ChartPanelDraft {
  panel: NewChartPanel;
  view: ChartPanelViewSettings;
}

/** グループ化のキーの候補。Runをグループ化できない場所（単一のRun）では無い。 */
export interface ChartGroupingOptions {
  tagKeys: readonly string[];
  paramKeys: readonly string[];
}

/** 1つのパネルのメトリクスと、その軸、平滑化、グループ化を選ぶ。 */
export function ChartPanelEditor({
  dialogTitle,
  initial,
  metricKeys,
  grouping,
  onSave,
  onClose,
}: {
  dialogTitle: string;
  initial: ChartPanelDraft;
  metricKeys: readonly string[];
  grouping?: ChartGroupingOptions;
  onSave: (draft: ChartPanelDraft) => void;
  onClose: () => void;
}) {
  useLocale();
  const id = useId();
  const [panel, setPanel] = useState(initial.panel);
  const [view, setView] = useState(initial.view);
  const [query, setQuery] = useState('');
  const selected = panel.metricKeys;
  const isFull = selected.length >= MAX_PANEL_METRIC_KEYS;
  const normalizedQuery = query.trim().toLowerCase();
  // 選んだキーは、検索で隠れても選択を外せるよう一覧に残す。
  const listed = metricKeys.filter(
    (key) => selected.includes(key) || key.toLowerCase().includes(normalizedQuery),
  );
  const isGroupingIncomplete = panel.groupBy !== undefined && !isCompleteGrouping(panel.groupBy);

  function toggleKey(key: string, checked: boolean) {
    const metricKeysNext = checked ? [...selected, key] : selected.filter((item) => item !== key);
    setPanel({ ...panel, metricKeys: metricKeysNext });
  }
  function changeDisplay(settings: ChartDisplaySettings) {
    setPanel({
      ...panel,
      xAxis: settings.xAxis,
      yScale: settings.yScale,
      smoothing: settings.smoothing,
      showRange: settings.showRange,
    });
    setView({ xScale: settings.xScale, showRaw: settings.showRaw });
  }
  function changeGrouping(groupBy: RunGroupBy | undefined) {
    const { groupBy: _previous, ...rest } = panel;
    setPanel(groupBy ? { ...rest, groupBy } : rest);
  }

  return (
    <Dialog title={dialogTitle} onClose={onClose} size="wide" className="chart-panel-editor">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!selected.length || isGroupingIncomplete) return;
          const title = panel.title?.trim();
          const { title: _title, ...rest } = panel;
          onSave({ panel: title ? { ...rest, title } : rest, view });
        }}
      >
        <div className="field">
          <label htmlFor={`${id}-title`}>{text.chartPanelTitle}</label>
          <input
            id={`${id}-title`}
            value={panel.title ?? ''}
            placeholder={text.chartPanelTitleHint}
            onChange={(event) => setPanel({ ...panel, title: event.target.value })}
          />
        </div>
        <fieldset className="chart-metric-picker">
          <legend>
            {text.chartMetricKeys}{' '}
            <small>{textTemplates.chartMetricKeysSelected(selected.length, MAX_PANEL_METRIC_KEYS)}</small>
          </legend>
          <input
            type="search"
            aria-label={text.chartMetricKeySearch}
            placeholder={text.chartMetricKeySearch}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="chart-metric-options">
            {listed.map((key) => {
              const checked = selected.includes(key);
              return (
                <label className="checkbox-field" key={key}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && isFull}
                    onChange={(event) => toggleKey(key, event.target.checked)}
                  />
                  <span className="mono">{key}</span>
                </label>
              );
            })}
            {!listed.length && <p className="muted">{text.chartMetricKeyNoMatch}</p>}
          </div>
          {!selected.length && <p className="chart-picker-error">{text.chartMetricKeysRequired}</p>}
        </fieldset>
        <ChartControls
          settings={{
            xAxis: panel.xAxis,
            xScale: view.xScale,
            yScale: panel.yScale,
            smoothing: panel.smoothing,
            showRange: panel.showRange,
            showRaw: view.showRaw,
          }}
          metricKeys={metricKeys}
          onChange={changeDisplay}
        />
        {grouping && (
          <RunGroupingControl
            value={panel.groupBy}
            tagKeys={grouping.tagKeys}
            paramKeys={grouping.paramKeys}
            onChange={changeGrouping}
          />
        )}
        <footer>
          <button type="button" className="button" onClick={onClose}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={!selected.length || isGroupingIncomplete}>
            {text.save}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
