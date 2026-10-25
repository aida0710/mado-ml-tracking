// Runのメディアのstep。スライダーは記録したstepにだけ止まり、比較は記録したstepから列を選び、
// プレーヤーを切り替えても再生位置を保つ。
import { MEDIA_COMPARE_MAX_STEPS, type RunMedia } from '@mmt/contracts';

/** 記録したstepを、重複を除いて昇順に並べたもの。 */
export function sortedSteps(steps: Iterable<number>): number[] {
  return [...new Set(steps)].sort((left, right) => left - right);
}

/** 1つのキーのメディアをstepごとにまとめたもの。stepは昇順に出る。 */
export function groupMediaByStep(items: readonly RunMedia[]): Map<number, RunMedia[]> {
  const groups = new Map<number, RunMedia[]>();
  for (const step of sortedSteps(items.map((item) => item.step))) groups.set(step, []);
  for (const item of items) groups.get(item.step)!.push(item);
  return groups;
}

/**
 * `target`に最も近い記録済みのstep。同じ近さなら前のstepを選び、ほかのキーへ移っても、利用者が
 * 見ていたより学習の後のメディアを出さないようにする。何も記録していなければnull。
 */
export function nearestStep(steps: readonly number[], target: number): number | null {
  let nearest: number | null = null;
  for (const step of steps)
    if (nearest === null || Math.abs(step - target) < Math.abs(nearest - target)) nearest = step;
  return nearest;
}

// PageUp/PageDownで、記録したstepをこの数だけ移る。長いRunの毎stepで記録したキーのため。
export const STEP_PAGE_JUMP = 10;

/**
 * stepのスライダーでキーを押した後の`steps`の位置。スライダーが無視するキーではnull。
 * 両端で止まり、反対の端へは回らない。回ると、利用者が気づかないうちに最後のcheckpointから
 * 最初へ飛んでしまう。
 */
export function stepIndexAfterKey(stepCount: number, currentIndex: number, key: string): number | null {
  if (stepCount === 0) return null;
  const last = stepCount - 1;
  const clamp = (index: number) => Math.min(last, Math.max(0, index));
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return clamp(currentIndex - 1);
    case 'ArrowRight':
    case 'ArrowUp':
      return clamp(currentIndex + 1);
    case 'PageDown':
      return clamp(currentIndex - STEP_PAGE_JUMP);
    case 'PageUp':
      return clamp(currentIndex + STEP_PAGE_JUMP);
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}

/**
 * 最初から最後まで均等に散らした、最大`count`個の記録済みのstep。両端は必ず含める。記録した
 * stepだけを返すので、比較が誰も記録していないstepを求めることはない。
 */
export function evenlySpacedSteps(steps: readonly number[], count = MEDIA_COMPARE_MAX_STEPS): number[] {
  const sorted = sortedSteps(steps);
  if (sorted.length <= count) return sorted;
  if (count <= 1) return sorted.slice(-1);
  const picked = new Set<number>();
  for (let index = 0; index < count; index += 1)
    picked.add(sorted[Math.round((index * (sorted.length - 1)) / (count - 1))]!);
  return sortedSteps(picked);
}

/**
 * A/B比較でセルを切り替えたとき、次のプレーヤーが始まる位置。前のプレーヤーと同じ時点にする。
 * 次のファイルがその時点より短ければ、すぐ終わってしまわないよう最初から始める。長さが
 * 分からない（metadataをまだ読み込んでいない）ときは位置を保つ。
 */
export function handoffPosition(previousSeconds: number, nextDurationSeconds: number | null): number {
  if (!Number.isFinite(previousSeconds) || previousSeconds <= 0) return 0;
  if (nextDurationSeconds === null || !Number.isFinite(nextDurationSeconds)) return previousSeconds;
  return previousSeconds < nextDurationSeconds ? previousSeconds : 0;
}

/** 前のプレーヤーから次のプレーヤーへ渡す、再生中（または一時停止中）の位置。 */
export interface PlaybackHandoff {
  seconds: number;
  playing: boolean;
}

export function playbackHandoffFrom(element: Pick<HTMLMediaElement, 'currentTime' | 'paused'> | null): PlaybackHandoff | null {
  if (!element) return null;
  return { seconds: element.currentTime, playing: !element.paused };
}

/** Run × stepの比較の格子のセル。 */
export interface GridPosition {
  row: number;
  column: number;
}

/** 比較の格子で矢印・Home・Endのキーを押した後のセル。ほかのキーではnull。 */
export function gridPositionAfterKey(
  size: { rows: number; columns: number },
  current: GridPosition,
  key: string,
): GridPosition | null {
  if (size.rows === 0 || size.columns === 0) return null;
  const clampRow = (row: number) => Math.min(size.rows - 1, Math.max(0, row));
  const clampColumn = (column: number) => Math.min(size.columns - 1, Math.max(0, column));
  switch (key) {
    case 'ArrowUp':
      return { row: clampRow(current.row - 1), column: current.column };
    case 'ArrowDown':
      return { row: clampRow(current.row + 1), column: current.column };
    case 'ArrowLeft':
      return { row: current.row, column: clampColumn(current.column - 1) };
    case 'ArrowRight':
      return { row: current.row, column: clampColumn(current.column + 1) };
    case 'Home':
      return { row: current.row, column: 0 };
    case 'End':
      return { row: current.row, column: size.columns - 1 };
    default:
      return null;
  }
}

/** URLに残したstep。パラメータが無いかstepでなければnullで、最新のstepを出す。 */
export function parseStepParam(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const step = Number(value);
  return Number.isSafeInteger(step) ? step : null;
}
