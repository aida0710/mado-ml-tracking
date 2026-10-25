// 平行座標の図の裏にある純粋なロジック。値が軸のどこに来るか、ブラシがどのRunを残すか、軸の
// 並べ替え、単一色相のカラーランプを扱う。位置は正規化する。0が値の範囲の下端、1が上端で、
// nullはRunに値が無いこと（「値なし」の帯）を表す。

export type AxisScaleKind = 'linear' | 'log' | 'categorical';

/** 縦の軸1本。パラメータ、メトリクス、Sweepの目的のどれかで、`key`で見分ける。 */
export interface AxisDefinition {
  key: string;
  label: string;
  kind: 'numeric' | 'categorical';
  /** カテゴリの軸だけ: APIから来たカテゴリの順。載っていない値は後ろに足す。 */
  categories?: string[];
}

export interface AxisScale {
  kind: AxisScaleKind;
  /** 値が無いか、この軸に置けないときはnull。 */
  position: (value: unknown) => number | null;
  /** 決まった位置のラベル。下から上の順。 */
  ticks: { position: number; label: string }[];
}

/** 1本の軸のドラッグは、位置が[from, to]（両端を含む）に入るRunを残す。 */
export interface AxisBrush {
  axisKey: string;
  from: number;
  to: number;
}

export interface ParallelRow {
  runId: string;
  values: Record<string, unknown>;
}

/** 分析の図が描くRun。`values`のキーはAxisDefinition.key。 */
export interface ChartRunRow extends ParallelRow {
  name: string;
}

// APIと同じ規則（docs/api-contract.md）。10進と指数の形だけを数とみなすので、'0x10'や
// 'Infinity'はカテゴリのままになる。
const NUMERIC_STRING = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const NUMERIC_TICK_COUNT = 5;
// カテゴリが1つだけの軸や、数値が一定の軸は、端でなく中央に置く。
const SINGLE_VALUE_POSITION = 0.5;

/** パラメータやメトリクスの値が表す有限の数。無ければnull。 */
export function numericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && NUMERIC_STRING.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** 値のカテゴリの文字列。APIの`values`に合わせる（オブジェクトと配列はJSON）。 */
export function categoryLabel(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function finiteRange(values: unknown[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    const number = numericValue(value);
    if (number === null) continue;
    if (number < min) min = number;
    if (number > max) max = number;
  }
  return min <= max ? { min, max } : null;
}

/** 対数スケールは、軸の値がすべて正のときだけ選べる。 */
export function canUseLogScale(values: unknown[]): boolean {
  const range = finiteRange(values);
  return range !== null && range.min > 0;
}

function compactNumber(value: number): string {
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || magnitude < 1e-3) return value.toExponential(2);
  return String(Number(value.toPrecision(4)));
}

function createNumericScale(values: unknown[], requestLog: boolean): AxisScale {
  const range = finiteRange(values);
  const useLog = requestLog && range !== null && range.min > 0;
  const transform = useLog ? Math.log10 : (value: number) => value;
  const low = range ? transform(range.min) : 0;
  const high = range ? transform(range.max) : 0;
  const span = high - low;
  const position = (value: unknown) => {
    const number = numericValue(value);
    if (number === null || range === null) return null;
    if (useLog && number <= 0) return null;
    return span === 0 ? SINGLE_VALUE_POSITION : (transform(number) - low) / span;
  };
  const ticks = !range
    ? []
    : span === 0
      ? [{ position: SINGLE_VALUE_POSITION, label: compactNumber(range.min) }]
      : Array.from({ length: NUMERIC_TICK_COUNT }, (_, index) => {
          const tickPosition = index / (NUMERIC_TICK_COUNT - 1);
          const transformed = low + span * tickPosition;
          return { position: tickPosition, label: compactNumber(useLog ? 10 ** transformed : transformed) };
        });
  return { kind: useLog ? 'log' : 'linear', position, ticks };
}

function createCategoricalScale(definition: AxisDefinition, values: unknown[]): AxisScale {
  const categories = [...(definition.categories ?? [])];
  const known = new Set(categories);
  const unlisted = new Set<string>();
  for (const value of values) {
    const label = categoryLabel(value);
    if (label !== null && !known.has(label)) unlisted.add(label);
  }
  categories.push(...[...unlisted].sort());
  const indexOf = new Map(categories.map((category, index) => [category, index]));
  const categoryPosition = (index: number) =>
    categories.length === 1 ? SINGLE_VALUE_POSITION : index / (categories.length - 1);
  return {
    kind: 'categorical',
    position: (value) => {
      const label = categoryLabel(value);
      const index = label === null ? undefined : indexOf.get(label);
      return index === undefined ? null : categoryPosition(index);
    },
    ticks: categories.map((category, index) => ({ position: categoryPosition(index), label: category })),
  };
}

/**
 * 1本の軸が表示する値に合わせたスケール。数値の軸は線形で、求められていて値がすべて正なら
 * 対数にする。カテゴリの軸はカテゴリを等間隔に並べる。
 */
export function createAxisScale(definition: AxisDefinition, values: unknown[], options: { log: boolean }): AxisScale {
  return definition.kind === 'numeric'
    ? createNumericScale(values, options.log)
    : createCategoricalScale(definition, values);
}

/** ブラシは無い値を残さない。無い値はどの範囲の中にも入らない。 */
export function isWithinBrush(position: number | null, brush: AxisBrush): boolean {
  if (position === null) return false;
  const low = Math.min(brush.from, brush.to);
  const high = Math.max(brush.from, brush.to);
  return position >= low && position <= high;
}

/** すべての行の軸上の位置。スケールが変わるたびに1回だけ計算し、ブラシでは数の比較だけで済ませる。 */
export function computePositions(
  rows: ParallelRow[],
  axes: { key: string; scale: AxisScale }[],
): Map<string, (number | null)[]> {
  return new Map(axes.map((axis) => [axis.key, rows.map((row) => axis.scale.position(row.values[axis.key]))]));
}

/** すべてのブラシの中に入る行の添字（ブラシが無ければすべての行）。 */
export function selectRowIndexes(
  rowCount: number,
  positions: Map<string, (number | null)[]>,
  brushes: AxisBrush[],
): number[] {
  const active = brushes.flatMap((brush) => {
    const axisPositions = positions.get(brush.axisKey);
    return axisPositions ? [{ brush, axisPositions }] : [];
  });
  const selected: number[] = [];
  for (let index = 0; index < rowCount; index += 1)
    if (active.every(({ brush, axisPositions }) => isWithinBrush(axisPositions[index] ?? null, brush)))
      selected.push(index);
  return selected;
}

/** `key`を`offset`だけ動かした後の軸の順。範囲の外へ動かすときは順を変えない。 */
export function moveAxis(order: string[], key: string, offset: number): string[] {
  const from = order.indexOf(key);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}

/**
 * 図を描く幅。与えられた幅を使い、それでは軸の間隔が`minAxisSpacing`より狭くなるときは広げる
 * （そのとき図は自分の枠の中で横にスクロールする）。
 */
export function parallelPlotWidth({
  availableWidth,
  axisCount,
  minAxisSpacing,
  horizontalMargin,
}: {
  availableWidth: number;
  axisCount: number;
  minAxisSpacing: number;
  horizontalMargin: number;
}): number {
  if (availableWidth <= 0) return 0;
  const neededWidth = horizontalMargin + Math.max(0, axisCount - 1) * minAxisSpacing;
  return Math.max(availableWidth, neededWidth);
}

// 単一色相の青のランプ（datavizの参照パレット）。暗い背景に明るい線を描くときは順を逆にし、
// 最もよい値がどちらの背景でもいちばん目立つようにする。両端は、図の背景に対する線にWCAGが
// 求める3:1をまだ保てる段で止める（白の上では400、暗いテーマでは500）。
const LIGHT_RAMP = ['#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#104281', '#0d366b'];
const DARK_RAMP = ['#256abf', '#3987e5', '#5598e7', '#6da7ec', '#9ec5f4', '#cde2fb'];
export const MISSING_COLOR_VALUE = '#9a9a96';

/** 正規化した色の値に対応する線の色。null（値なし）は中立の灰色。 */
export function rampColor(position: number | null, theme: 'light' | 'dark'): string {
  if (position === null) return MISSING_COLOR_VALUE;
  const ramp = theme === 'dark' ? DARK_RAMP : LIGHT_RAMP;
  const clamped = Math.min(1, Math.max(0, position));
  return ramp[Math.round(clamped * (ramp.length - 1))]!;
}

/** 凡例のグラデーションに使う、ランプのすべての段の色。 */
export function rampStops(theme: 'light' | 'dark'): string[] {
  return theme === 'dark' ? [...DARK_RAMP] : [...LIGHT_RAMP];
}
