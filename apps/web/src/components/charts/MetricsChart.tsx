import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { MetricXRange } from '@mmt/contracts';
import type { MetricsChartProps } from './chartProps';
import { ChartDescription } from './ChartDescription';
import { ChartLegend } from './ChartLegend';
import { ChartPlotLayer, type ChartHoverPosition } from './ChartPlotLayer';
import { ChartTooltip } from './ChartTooltip';
import { Empty } from '../Feedback';
import { useDocumentTheme } from '../../hooks/useDocumentTheme';
import { paddedDomain, xExtent } from '../../lib/chartScale';
import {
  chartCursorStops,
  chartZoomKeyOf,
  isBrowserShortcut,
  isChartCursorKey,
  moveChartCursor,
  zoomedChartRange,
} from '../../lib/chartKeyboard';
import { formatXTick, formatXValue } from '../../lib/chartXAxis';
import { formatChartTick } from '../../lib/chartTicks';
import { prepareChartLines, valuesAtX, type ChartLine } from '../../lib/metricSeries';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

const DEFAULT_CHART_HEIGHT = 320;
const CHART_MARGIN = { top: 16, right: 24, left: 8, bottom: 8 };
const Y_AXIS_WIDTH = 70;
// About the rows that fit beside the pointer without covering the chart.
const TOOLTIP_MAX_ROWS = 10;
// Gap between the pointer and the tooltip box.
const TOOLTIP_OFFSET_PIXELS = 14;

/**
 * Metric lines of Runs and Run groups, drawn from the data it is given (it fetches nothing, so a
 * report can pass saved data). Lines and bands are single SVG paths per series so 200 Runs stay
 * light; recharts draws the axes and grid. Hover shows the values at x, dragging zooms into x.
 * With the keyboard the plot is one focus stop: arrow keys move the cursor whose values the tooltip
 * shows, + and - zoom around it. A screen reader hears each line's last value and range.
 */
export function MetricsChart({
  series,
  styleIds,
  xAxis,
  xScale = 'linear',
  yScale,
  valueUnit = 'number',
  smoothing,
  showRange,
  showRaw,
  markers = [],
  height = DEFAULT_CHART_HEIGHT,
  onZoom,
}: MetricsChartProps) {
  useLocale();
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [zoomRange, setZoomRange] = useState<MetricXRange | null>(null);
  const [hover, setHover] = useState<ChartHoverPosition | null>(null);
  const [keyboardX, setKeyboardX] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const theme = useDocumentTheme();
  const summaryId = useId();
  const keyboardHintId = useId();

  const lines = useMemo(
    () => prepareChartLines(series, { xScale, yScale, smoothing, theme, styleIds }),
    [series, xScale, yScale, smoothing, theme, styleIds],
  );
  const visibleLines = useMemo(
    () => lines.filter((line) => !hiddenIds.has(line.id)),
    [lines, hiddenIds],
  );
  const isSmoothed = smoothing.kind !== 'none' && smoothing.weight > 0;
  const fullXExtent = useMemo(
    () =>
      xExtent(
        visibleLines.flatMap((line) => line.points.map((point) => point.x)),
        xScale,
      ),
    [visibleLines, xScale],
  );
  const xDomain = zoomRange ? ([zoomRange.min, zoomRange.max] as [number, number]) : fullXExtent;
  const yDomain = useMemo(
    () =>
      xDomain &&
      paddedDomain(
        visibleLineValuesIn(visibleLines, xDomain, { showRange, showRaw: showRaw && isSmoothed }),
        yScale,
      ),
    [visibleLines, xDomain, showRange, showRaw, isSmoothed, yScale],
  );
  const excludedCount = lines.reduce((sum, line) => sum + line.excludedCount, 0);

  function changeZoom(range: MetricXRange | null) {
    setZoomRange(range);
    onZoom?.(range);
  }

  // A drag or the reset button leaves the pointer elsewhere, so the values it showed go away. The
  // keyboard zooms around its cursor, which stays at the same pixel, so its values stay.
  function changeZoomFromPointer(range: MetricXRange | null) {
    changeZoom(range);
    setHover(null);
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!xDomain || !fullXExtent || isBrowserShortcut(event)) return;
    const zoomKey = chartZoomKeyOf(event.key);
    if (isChartCursorKey(event.key)) {
      event.preventDefault();
      const stops = chartCursorStops(visibleLines, xDomain);
      setKeyboardX(moveChartCursor({ stops, current: keyboardX, key: event.key }));
    } else if (zoomKey) {
      event.preventDefault();
      changeZoom(
        zoomedChartRange({ shown: xDomain, extent: fullXExtent, center: keyboardX, key: zoomKey, scale: xScale }),
      );
    } else if (event.key === 'Escape' && keyboardX !== null) {
      // Only while the cursor shows, so Escape still reaches a dialog the chart sits in.
      event.preventDefault();
      event.stopPropagation();
      hideKeyboardCursor();
    }
  }

  function hideKeyboardCursor() {
    setKeyboardX(null);
    setHover(null);
  }

  function toggleLine(id: string) {
    setHiddenIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  const legend = (
    <ChartLegend
      lines={lines}
      hiddenIds={hiddenIds}
      onToggle={toggleLine}
      onHighlight={setHighlightedId}
      onShowAll={() => setHiddenIds(new Set())}
    />
  );
  if (!xDomain || !yDomain)
    return (
      <div className="metrics-chart">
        {lines.length > 0 && legend}
        <Empty>{text.chartNoData}</Empty>
      </div>
    );

  const tooltip =
    hover && valuesAtX(visibleLines, hover.x, { highlightedId, maxRows: TOOLTIP_MAX_ROWS });
  // Two corners of the domain give recharts' axes data to measure; the series draw themselves.
  const domainCorners = [
    { x: xDomain[0], y: yDomain[0] },
    { x: xDomain[1], y: yDomain[1] },
  ];
  return (
    <div className="metrics-chart">
      {legend}
      {/* role="application": a screen reader passes the arrow keys on instead of reading by line. */}
      <div
        className="metrics-chart-canvas"
        style={{ height }}
        role="application"
        aria-roledescription={text.chartKeyboardRoleDescription}
        aria-label={textTemplates.chartAriaLabel(lines.length)}
        aria-describedby={`${summaryId} ${keyboardHintId}`}
        tabIndex={0}
        onKeyDown={handleKey}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          hideKeyboardCursor();
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          {/* recharts' own keyboard layer moves a tooltip this chart does not use. */}
          <ComposedChart data={domainCorners} margin={CHART_MARGIN} accessibilityLayer={false}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              type="number"
              dataKey="x"
              domain={xDomain}
              scale={xScale}
              allowDataOverflow
              allowDecimals={xAxis.kind !== 'step'}
              tickFormatter={(value: number) => formatXTick(xAxis, value)}
              tick={{ fontSize: 11 }}
            />
            {/* 'auto' rounds the corners' y span out to round ticks; the lines use the same scale. */}
            <YAxis
              type="number"
              dataKey="y"
              domain={['auto', 'auto']}
              scale={yScale}
              width={Y_AXIS_WIDTH}
              tickFormatter={(value: number) => formatChartTick(value, valueUnit)}
              tick={{ fontSize: 11 }}
            />
            {/* Invisible: gives recharts a graphical item that reads the corners for the axes. */}
            <Line
              dataKey="y"
              stroke="none"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <ChartPlotLayer
              lines={visibleLines}
              highlightedId={highlightedId}
              showRange={showRange}
              showRaw={showRaw && isSmoothed}
              markers={markers}
              hoverPixelX={hover?.pixelX ?? null}
              keyboardX={keyboardX}
              onHover={setHover}
              onZoom={changeZoomFromPointer}
            />
          </ComposedChart>
        </ResponsiveContainer>
        {hover && tooltip && tooltip.rows.length > 0 && (
          <ChartTooltip
            xText={formatXValue(xAxis, hover.x)}
            rows={tooltip.rows}
            hiddenRowCount={tooltip.hiddenRowCount}
            position={{
              alignRight: hover.pixelX > hover.chartWidth / 2,
              left:
                hover.pixelX > hover.chartWidth / 2
                  ? hover.pixelX - TOOLTIP_OFFSET_PIXELS
                  : hover.pixelX + TOOLTIP_OFFSET_PIXELS,
              top: hover.pixelY + TOOLTIP_OFFSET_PIXELS,
            }}
          />
        )}
      </div>
      <ChartDescription
        lines={visibleLines}
        xAxis={xAxis}
        summaryId={summaryId}
        keyboardHintId={keyboardHintId}
      />
      <div className="metrics-chart-footer">
        {excludedCount > 0 && (
          <span className="chart-note">{textTemplates.chartLogExcluded(excludedCount)}</span>
        )}
        {zoomRange && (
          <button type="button" className="button small" onClick={() => changeZoomFromPointer(null)}>
            {text.chartResetZoom}
          </button>
        )}
        {isFocused ? (
          <span className="chart-note">{text.chartKeyboardHint}</span>
        ) : (
          !zoomRange && <span className="chart-note">{text.chartZoomHint}</span>
        )}
      </div>
    </div>
  );
}

/** The values the y axis must show: drawn lines inside the x domain, and bands when shown. */
function* visibleLineValuesIn(
  lines: readonly ChartLine[],
  [minX, maxX]: [number, number],
  shown: { showRange: boolean; showRaw: boolean },
): Generator<number> {
  for (const line of lines) {
    for (const [index, point] of line.points.entries()) {
      if (point.x < minX || point.x > maxX) continue;
      yield line.smoothedValues[index]!;
      if (shown.showRaw) yield point.value;
      if (shown.showRange && point.min !== undefined && point.max !== undefined) {
        yield point.min;
        yield point.max;
      }
    }
  }
}
