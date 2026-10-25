import { useEffect, useEffectEvent, useId, useMemo, useState, type PointerEvent } from 'react';
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

// これより短いドラッグはズームでなくクリック。
const MIN_ZOOM_DRAG_PIXELS = 6;
// キーボードのカーソルのツールチップを、プロットの上端からこれだけ下に置く。
const KEYBOARD_TOOLTIP_TOP_PIXELS = 8;

/** 値を出す位置。データの単位のxと、ツールチップを置く基準のピクセル。 */
export interface ChartHoverPosition {
  x: number;
  pixelX: number;
  pixelY: number;
  chartWidth: number;
}

/**
 * rechartsのプロット領域の中に、その軸のスケールで描く。範囲の帯、平滑化前の薄い線、線、再開の
 * マーカー、ホバーのカーソル、ズームの選択範囲。一番上の透明なrectがポインタを受ける。
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
  /** キーボードのカーソルがあるx。そのピクセルの位置は、rechartsの中にあるここで分かる。 */
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
  // キーボードのカーソルは、同じxでホバーしたときのように値を出す。このeffectは数値だけに
  // 依存させる。rechartsは描画のたびに新しいスケールの関数を渡し、その描画はホバー自体が起こす。
  const keyboardPixelX = keyboardX === null || !scales ? undefined : scales.x(keyboardX);
  const plotTop = plotArea?.y;
  const chartWidth = useChartWidth();
  // onHoverは親のstateのsetter。新しいものになってもカーソルは動かさない。
  const showHover = useEffectEvent((hover: ChartHoverPosition) => onHover(hover));
  useEffect(() => {
    if (keyboardX === null || keyboardPixelX === undefined || !Number.isFinite(keyboardPixelX)) return;
    if (plotTop === undefined || chartWidth === undefined) return;
    showHover({
      x: keyboardX,
      pixelX: keyboardPixelX,
      pixelY: plotTop + KEYBOARD_TOOLTIP_TOP_PIXELS,
      chartWidth,
    });
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
  // 強調した線が上に来るよう最後に描く。
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
        {/* 1回だけ記録した値（最後の評価など）は描く線が無いので、点で出す。 */}
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
          // 指はタップの直後に離れる。そのタップで出した値は、次のタップまで残す。
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

