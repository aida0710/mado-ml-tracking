import type { MetricsChartPoint } from '../components/charts/chartProps';

export type ChartScale = 'linear' | 'log';

// 線の上下の余白。極値が枠に触れないようにする。
const LINEAR_DOMAIN_PADDING_RATIO = 0.05;
// 対数軸では同じ余白を比で取る。両側にそれぞれ1桁（10倍）の約5%。
const LOG_DOMAIN_PADDING_FACTOR = 10 ** 0.05;

export interface PlottablePoints {
  points: MetricsChartPoint[];
  /** 対数軸が0以下の値を置けないために外した点。 */
  excludedCount: number;
}

/**
 * 対数軸が置ける点だけを残す。x（対数のx軸）か値（対数のy軸）が0以下の点は、作った値へ動かさずに
 * 外して数える。帯の下端が0以下なら、その点の帯は捨て、線の値は残す。
 */
export function keepPlottablePoints(
  points: readonly MetricsChartPoint[],
  scales: { xScale: ChartScale; yScale: ChartScale },
): PlottablePoints {
  if (scales.xScale === 'linear' && scales.yScale === 'linear')
    return { points: [...points], excludedCount: 0 };
  const kept: MetricsChartPoint[] = [];
  let excludedCount = 0;
  for (const point of points) {
    if ((scales.xScale === 'log' && point.x <= 0) || (scales.yScale === 'log' && point.value <= 0)) {
      excludedCount += 1;
      continue;
    }
    const isBandPlottable =
      scales.yScale === 'linear' || point.min === undefined || point.min > 0;
    kept.push(isBandPlottable ? point : { x: point.x, value: point.value });
  }
  return { points: kept, excludedCount };
}

/**
 * 与えた値に対してy軸が表示する[min, max]。線が枠に触れないよう余白を付けるが、0は余白で越えない。
 * 有限でない値（と対数軸での0以下の値）は無視する。何も残らなければnull。
 */
export function paddedDomain(values: Iterable<number>, scale: ChartScale): [number, number] | null {
  const extent = plottableExtent(values, scale);
  if (!extent) return null;
  const [min, max] = extent;
  if (scale === 'log') return [min / LOG_DOMAIN_PADDING_FACTOR, max * LOG_DOMAIN_PADDING_FACTOR];
  // 平らな線にも、周りに見える幅が要る。
  const padding =
    max === min
      ? Math.abs(min) * LINEAR_DOMAIN_PADDING_RATIO || 1
      : (max - min) * LINEAR_DOMAIN_PADDING_RATIO;
  // 余白は0を越えてはいけない。損失やバイト数の軸が0未満まであると、そこに値があるように読める。
  const lower = min >= 0 ? Math.max(0, min - padding) : min - padding;
  const upper = max <= 0 ? Math.min(0, max + padding) : max + padding;
  return lower === upper ? [lower - padding, upper + padding] : [lower, upper];
}

/** xの値の[min, max]。線が枠の端から端まで描かれるよう、余白は付けない。 */
export function xExtent(values: Iterable<number>, scale: ChartScale): [number, number] | null {
  const extent = plottableExtent(values, scale);
  if (!extent) return null;
  const [min, max] = extent;
  if (min < max) return extent;
  // xが1つだけでも、描くための幅が要る。
  return scale === 'log' ? [min / 10, min * 10] : [min - 1, max + 1];
}

function plottableExtent(values: Iterable<number>, scale: ChartScale): [number, number] | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value) || (scale === 'log' && value <= 0)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min > max ? null : [min, max];
}

/** データの値をピクセルに対応づける。軸が置けない値はundefined。 */
export type PixelScale = (value: number) => number | undefined;

// 1点だけの区間（1回だけ記録したメトリクスや、2つの欠損に挟まれた値）は線を引く長さが無いので、
// lonePointsPathがこの半径の塗った点として描く。
const LONE_POINT_RADIUS_PIXELS = 3.5;

type PixelPoint = [number, number];

/**
 * (x, value)の組をピクセルの点にし、値を置けない（NaN）ところで区間に分ける。欠損が、またいだ
 * 直線でなく、欠損として見えるようにする。
 */
function pixelPieces(
  xs: readonly number[],
  values: readonly number[],
  scales: { x: PixelScale; y: PixelScale },
): PixelPoint[][] {
  const pieces: PixelPoint[][] = [[]];
  xs.forEach((x, index) => {
    const pixelX = scales.x(x);
    const pixelY = Number.isFinite(values[index]) ? scales.y(values[index]!) : undefined;
    if (!isPixel(pixelX) || !isPixel(pixelY)) {
      if (pieces.at(-1)!.length) pieces.push([]);
      return;
    }
    pieces.at(-1)!.push([pixelX, pixelY]);
  });
  return pieces.filter((piece) => piece.length > 0);
}

/** (x, value)の組を通る線のSVGのpath。1点だけの区間はlonePointsPathに任せる。 */
export function linePath(
  xs: readonly number[],
  values: readonly number[],
  scales: { x: PixelScale; y: PixelScale },
): string {
  return pixelPieces(xs, values, scales)
    .filter((piece) => piece.length > 1)
    .map((piece) =>
      piece.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(''),
    )
    .join('');
}

/**
 * 線を引く隣の点が無い点ごとに打つ点のSVGのpath。線の色で塗る。これが無いと、1回だけ記録した
 * メトリクスは何も描かれない。pathには円のコマンドが無いので、半円の弧を2つつないで点を作る。
 */
export function lonePointsPath(
  xs: readonly number[],
  values: readonly number[],
  scales: { x: PixelScale; y: PixelScale },
): string {
  const radius = LONE_POINT_RADIUS_PIXELS;
  const arc = (dx: number) => `a${radius},${radius} 0 1,0 ${dx},0`;
  return pixelPieces(xs, values, scales)
    .flatMap((piece) => (piece.length === 1 ? piece : []))
    .map(([x, y]) => `M${(x - radius).toFixed(1)},${y.toFixed(1)}${arc(2 * radius)}${arc(-2 * radius)}`)
    .join('');
}

/**
 * 最小〜最大の帯のSVGのpath。上端に沿って進み、下端に沿って戻る閉じた形。帯を持たない点が
 * あると、そこで今の形を閉じる。
 */
export function bandPath(
  points: readonly MetricsChartPoint[],
  scales: { x: PixelScale; y: PixelScale },
): string {
  let path = '';
  let piece: { x: number; top: number; bottom: number }[] = [];
  const closePiece = () => {
    if (piece.length > 1) {
      const upper = piece.map((corner) => `${corner.x.toFixed(1)},${corner.top.toFixed(1)}`);
      const lower = piece.map((corner) => `${corner.x.toFixed(1)},${corner.bottom.toFixed(1)}`);
      path += `M${upper.join('L')}L${lower.reverse().join('L')}Z`;
    }
    piece = [];
  };
  for (const point of points) {
    const x = scales.x(point.x);
    const top = point.max === undefined ? undefined : scales.y(point.max);
    const bottom = point.min === undefined ? undefined : scales.y(point.min);
    if (isPixel(x) && isPixel(top) && isPixel(bottom)) piece.push({ x, top, bottom });
    else closePiece();
  }
  closePiece();
  return path;
}

const isPixel = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value);
