import type { ChartLine } from '../../lib/metricSeries';
import { SeriesSwatch } from './SeriesSwatch';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/**
 * 図の系列をボタンとして並べる。クリックで1本を隠す・出す、ホバーでプロットの中のその線を
 * 強調する。各ボタンに線の色と線種を出すので、色覚に頼らなくても線を見分けられる。
 */
export function ChartLegend({
  lines,
  hiddenIds,
  onToggle,
  onHighlight,
  onShowAll,
}: {
  lines: readonly ChartLine[];
  hiddenIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onHighlight: (id: string | null) => void;
  onShowAll: () => void;
}) {
  useLocale();
  return (
    <div className="chart-legend" role="group" aria-label={text.chartLegend}>
      {lines.map((line) => (
        <button
          key={line.id}
          type="button"
          className="chart-legend-item"
          title={line.label}
          aria-pressed={!hiddenIds.has(line.id)}
          onClick={() => onToggle(line.id)}
          onMouseEnter={() => onHighlight(line.id)}
          onMouseLeave={() => onHighlight(null)}
          onFocus={() => onHighlight(line.id)}
          onBlur={() => onHighlight(null)}
        >
          <SeriesSwatch color={line.color} dashPattern={line.dashPattern} kind={line.kind} />
          <span className="chart-legend-label">
            {line.label}
            {line.kind === 'group' && text.chartGroupSuffix}
          </span>
        </button>
      ))}
      {hiddenIds.size > 0 && (
        <button type="button" className="button small" onClick={onShowAll}>
          {text.chartShowAllSeries}
        </button>
      )}
    </div>
  );
}
