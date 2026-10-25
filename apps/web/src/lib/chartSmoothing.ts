import type { ChartSmoothing } from '@mmt/contracts';

// W&BはEMAの重みを1未満に抑え、新しい値で線がまだ動くようにしている。
export const MAX_EMA_WEIGHT = 0.999;
// 重み1でガウスカーネルは約±60点にわたる。1000点の系列の数%。
const GAUSSIAN_MAX_SIGMA_POINTS = 20;
// カーネルは3シグマで切る。そこでの重みは中心の0.5%未満。
const GAUSSIAN_CUTOFF_SIGMAS = 3;
// 重み1で、移動平均は直前の100点をとる。
const RUNNING_AVERAGE_MAX_WINDOW = 100;

/**
 * 値を点の順に平滑化し、入力1つにつき1つの値を返す。有限でない入力は出力でもNaNのままにして
 * 飛ばすので、平滑化した線をリセットも引き寄せもしない。xの間隔の不揃いは重みに入れない。
 * W&Bと同じく、どの方法も点の順序だけで計算する。
 */
export function smoothValues(values: readonly number[], smoothing: ChartSmoothing): number[] {
  const weight = Math.min(Math.max(smoothing.weight, 0), 1);
  if (smoothing.kind === 'none' || weight === 0) return [...values];
  if (smoothing.kind === 'ema') return smoothEma(values, weight);
  if (smoothing.kind === 'gaussian') return smoothGaussian(values, weight);
  return smoothRunningAverage(values, weight);
}

/**
 * バイアスを補正した指数移動平均。W&BやTensorBoardと同じ式で、`last = last * w + (1 - w) * y`を、
 * n個の有限な値の後に`last / (1 - w^n)`として出すので、最初の点が0へ引き寄せられない。
 */
function smoothEma(values: readonly number[], weight: number): number[] {
  const w = Math.min(weight, MAX_EMA_WEIGHT);
  let last = 0;
  let finiteCount = 0;
  return values.map((value) => {
    if (!Number.isFinite(value)) return Number.NaN;
    last = last * w + (1 - w) * value;
    finiteCount += 1;
    return last / (1 - w ** finiteCount);
  });
}

/**
 * 隣接する有限な点にかけるガウスカーネル。両端ではカーネルを切り、存在する点で正規化し直すので、
 * 一定の系列は0へ曲がらず一定のままになる。
 */
function smoothGaussian(values: readonly number[], weight: number): number[] {
  const sigma = weight * GAUSSIAN_MAX_SIGMA_POINTS;
  const radius = Math.ceil(sigma * GAUSSIAN_CUTOFF_SIGMAS);
  const kernel = Array.from({ length: radius + 1 }, (_, offset) =>
    Math.exp(-(offset * offset) / (2 * sigma * sigma)),
  );
  const finiteIndexes = finiteValueIndexes(values);
  const output = values.map(() => Number.NaN);
  finiteIndexes.forEach((valueIndex, position) => {
    let weightedSum = 0;
    let weightSum = 0;
    const first = Math.max(0, position - radius);
    const last = Math.min(finiteIndexes.length - 1, position + radius);
    for (let neighbor = first; neighbor <= last; neighbor += 1) {
      const kernelWeight = kernel[Math.abs(neighbor - position)]!;
      weightedSum += kernelWeight * values[finiteIndexes[neighbor]!]!;
      weightSum += kernelWeight;
    }
    output[valueIndex] = weightedSum / weightSum;
  });
  return output;
}

/** 今の有限な点と、それより前の有限な点の平均。窓の大きさの分まで。 */
function smoothRunningAverage(values: readonly number[], weight: number): number[] {
  const windowSize = 1 + Math.round(weight * (RUNNING_AVERAGE_MAX_WINDOW - 1));
  const window: number[] = [];
  let windowSum = 0;
  return values.map((value) => {
    if (!Number.isFinite(value)) return Number.NaN;
    window.push(value);
    windowSum += value;
    if (window.length > windowSize) windowSum -= window.shift()!;
    return windowSum / window.length;
  });
}

function finiteValueIndexes(values: readonly number[]): number[] {
  const indexes: number[] = [];
  values.forEach((value, index) => {
    if (Number.isFinite(value)) indexes.push(index);
  });
  return indexes;
}
