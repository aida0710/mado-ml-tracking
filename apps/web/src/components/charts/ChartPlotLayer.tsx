import { useEffect, useId, useMemo, useState, type PointerEvent } from 'react';
import {
  useChartWidth,
  usePlotArea,
  useXAxisInverseScale,
  useXAxisScale,
  useYAxisScale,
} from 'recharts';
import type { MetricXRange } from '@mmt/contracts';
import type { MetricsChartMarker } from './chartProps';
import { bandPath, linePath, lonePointsPath, type PixelScale } from '../../lib/chartScale';
import type { ChartLine } from '../../lib/metricSeries';

// A shorter drag is a click, not a zoom.
const MIN_ZOOM_DRAG_PIXELS = 6;
// The tooltip of the keyboard cursor sits this far below the top of the plot.
const KEYBOARD_TOOLTIP_TOP_PIXELS = 8;

/** Where the values are shown: the x in data units and the pixel the tooltip is placed by. */
export interface ChartHoverPosition {
  x: number;
  pixelX: number;
  pixelY: number;
  chartWidth: number;
}

/**
 * Draws inside recharts' plot area with its scales: bands, faint raw lines, the lines, resume
 * markers, the hover cursor and the zoom selection. A transparent rect on top takes the pointer.
 */
export function ChartPlotLayer({
  lines,
  highlightedId,
  showRange,
  showRaw,
  markers,
  hoverPixelX,
  keyboardX,
  onHover,
  onZoom,
}: {
  lines: readonly ChartLine[];
  highlightedId: string | null;
  showRange: boolean;
  showRaw: boolean;
  markers: readonly MetricsChartMarker[];
  hoverPixelX: number | null;
  /** The x the keyboard cursor is on; its pixel position is known here, inside recharts. */
  keyboardX: number | null;
  onHover: (hover: ChartHoverPosition | null) => void;
  onZoom: (range: MetricXRange) => void;
}) {
  const clipPathId = `chart-clip-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const xScaleFunction = useXAxisScale();
  const yScaleFunction = useYAxisScale();
  const invertX = useXAxisInverseScale();
  const plotArea = usePlotArea();
  const [dragStartPixelX, setDragStartPixelX] = useState<number | null>(null);
  const scales = useMemo(
    (): { x: PixelScale; y: PixelScale } | null =>
      xScaleFunction && yScaleFunction ? { x: xScaleFunction, y: yScaleFunction } : null,
    [xScaleFunction, yScaleFunction],
  );
  const paths = useMemo(
    () =>
      scales
        ? lines.map((line) => {
            const xs = line.points.map((point) => point.x);
            return {
              line,
              band: showRange ? bandPath(line.points, scales) : '',
              raw: showRaw ? linePath(xs, line.points.map((point) => point.value), scales) : '',
              smoothed: linePath(xs, line.smoothedValues, scales),
              lonePoints: lonePointsPath(xs, line.smoothedValues, scales),
            };
          })
        : [],
    [lines, scales, showRange, showRaw],
  );
  // The keyboard cursor shows its values like a hover at the same x. The effect depends on numbers
  // only: recharts hands out new scale functions on every render, which the hover itself causes.
  const keyboardPixelX = keyboardX === null || !scales ? undefined : scales.x(keyboardX);
  const plotTop = plotArea?.y;
  const chartWidth = useChartWidth();
  useEffect(() => {
    if (keyboardX === null || keyboardPixelX === undefined || !Number.isFinite(keyboardPixelX)) return;
    if (plotTop === undefined || chartWidth === undefined) return;
    onHover({
      x: keyboardX,
      pixelX: keyboardPixelX,
      pixelY: plotTop + KEYBOARD_TOOLTIP_TOP_PIXELS,
      chartWidth,
    });
    // onHover is the parent's state setter.
  }, [keyboardX, keyboardPixelX, plotTop, chartWidth]);
  if (!scales || !invertX || !plotArea) return null;

  const pointerX = (event: PointerEvent<SVGRectElement>) => {
    const svgBox = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    return {
      pixelX: event.clientX - (svgBox?.left ?? 0),
      pixelY: event.clientY - (svgBox?.top ?? 0),
      chartWidth: svgBox?.width ?? 0,
    };
  };
  const dataX = (pixelX: number) => Number(invertX(pixelX));

  function finishDrag(event: PointerEvent<SVGRectElement>) {
    if (dragStartPixelX === null) return;
    const { pixelX } = pointerX(event);
    setDragStartPixelX(null);
    if (Math.abs(pixelX - dragStartPixelX) < MIN_ZOOM_DRAG_PIXELS) return;
    const [min, max] = [dataX(dragStartPixelX), dataX(pixelX)].sort((left, right) => left - right);
    if (Number.isFinite(min) && Number.isFinite(max)) onZoom({ min: min!, max: max! });
  }

  const isDimmed = (line: ChartLine) => highlightedId !== null && line.id !== highlightedId;
  // The highlighted line is drawn last so it lies on top.
  const ordered = [...paths].sort(
    (left, right) => Number(left.line.id === highlightedId) - Number(right.line.id === highlightedId),
  );
  return (
    <g className="chart-plot-layer">
      <defs>
        <clipPath id={clipPathId}>
          <rect x={plotArea.x} y={plotArea.y} width={plotArea.width} height={plotArea.height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipPathId})`}>
        {ordered.map(({ line, band }) =>
          band ? (
            <path
              key={`band-${line.id}`}
              d={band}
              fill={line.color}
              className={`chart-band ${line.kind}${isDimmed(line) ? ' dimmed' : ''}`}
            />
          ) : null,
        )}
        {ordered.map(({ line, raw }) =>
          raw ? (
            <path
              key={`raw-${line.id}`}
              d={raw}
              stroke={line.color}
              className={`chart-raw-line${isDimmed(line) ? ' dimmed' : ''}`}
            />
          ) : null,
        )}
        {ordered.map(({ line, smoothed }) => (
          <path
            key={`line-${line.id}`}
            d={smoothed}
            stroke={line.color}
            strokeDasharray={line.dashPattern ?? undefined}
            className={`chart-line ${line.kind}${isDimmed(line) ? ' dimmed' : ''}${
              line.id === highlightedId ? ' highlighted' : ''
            }`}
          />
        ))}
        {/* Values logged once (a final evaluation) have no line to draw, so they show as dots. */}
        {ordered.map(({ line, lonePoints }) =>
          lonePoints ? (
            <path
              key={`points-${line.id}`}
              d={lonePoints}
              fill={line.color}
              className={`chart-lone-points${isDimmed(line) ? ' dimmed' : ''}`}
            />
          ) : null,
        )}
        {markers.map((marker, index) => {
          const pixelX = scales.x(marker.x);
          if (pixelX === undefined || !Number.isFinite(pixelX)) return null;
          return (
            <g key={`marker-${index}`} className="chart-marker">
              <line x1={pixelX} x2={pixelX} y1={plotArea.y} y2={plotArea.y + plotArea.height} />
              <text x={pixelX + 4} y={plotArea.y + 12}>
                {marker.label}
              </text>
            </g>
          );
        })}
        {hoverPixelX !== null && (
          <line
            className="chart-cursor"
            x1={hoverPixelX}
            x2={hoverPixelX}
            y1={plotArea.y}
            y2={plotArea.y + plotArea.height}
          />
        )}
        {dragStartPixelX !== null && hoverPixelX !== null && (
          <rect
            className="chart-zoom-selection"
            x={Math.min(dragStartPixelX, hoverPixelX)}
            y={plotArea.y}
            width={Math.abs(hoverPixelX - dragStartPixelX)}
            height={plotArea.height}
          />
        )}
      </g>
      <rect
        className="chart-pointer-area"
        x={plotArea.x}
        y={plotArea.y}
        width={plotArea.width}
        height={plotArea.height}
        onPointerMove={(event) => {
          const position = pointerX(event);
          onHover({ ...position, x: dataX(position.pixelX) });
        }}
        onPointerLeave={(event) => {
          setDragStartPixelX(null);
          // A finger lifts off right after a tap; the values it asked for stay until the next tap.
          if (event.pointerType !== 'touch') onHover(null);
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const position = pointerX(event);
          setDragStartPixelX(position.pixelX);
          onHover({ ...position, x: dataX(position.pixelX) });
        }}
        onPointerUp={finishDrag}
        onPointerCancel={() => setDragStartPixelX(null)}
      />
    </g>
  );
}

