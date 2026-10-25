import { formatNumber } from '../../lib/format';
import type { ChartValueAtX } from '../../lib/metricSeries';
import { SeriesSwatch } from './SeriesSwatch';
import { useLocale } from '../../i18n/useLocale';
import { textTemplates } from '../../i18n/catalog';

/**
 * ホバーしたxでの各系列の値。行は図が並べ替え、入る分だけに切って渡す。`hiddenRowCount`は、
 * そこに値を持つ系列がほかにいくつあるか。
 */
export function ChartTooltip({
  xText,
  rows,
  hiddenRowCount,
  position,
}: {
  xText: string;
  rows: readonly ChartValueAtX[];
  hiddenRowCount: number;
  /** 図の左上からのピクセル。`alignRight`なら箱をポインタの左に置く。 */
  position: { left: number; top: number; alignRight: boolean };
}) {
  useLocale();
  return (
    <div
      className="chart-tooltip"
      role="status"
      style={{
        left: position.left,
        top: position.top,
        transform: position.alignRight ? 'translateX(-100%)' : undefined,
      }}
    >
      <div className="chart-tooltip-x mono">{xText}</div>
      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <SeriesSwatch color={row.color} dashPattern={row.dashPattern} />
              </td>
              <td className="chart-tooltip-label">{row.label}</td>
              <td className="mono">{formatNumber(row.value)}</td>
              {row.rawValue !== undefined && (
                <td className="mono chart-tooltip-raw">{formatNumber(row.rawValue)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {hiddenRowCount > 0 && (
        <div className="chart-tooltip-more">{textTemplates.chartTooltipMore(hiddenRowCount)}</div>
      )}
    </div>
  );
}
