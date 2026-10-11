import type { ChartLine } from '../../lib/metricSeries';
import { SeriesSwatch } from './SeriesSwatch';
import { text } from '../../i18n/catalog';

/**
 * The series of a chart as buttons: a click hides or shows one, hovering highlights it in the plot.
 * Each shows its line's color and pattern, so the lines are told apart without color vision too.
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
