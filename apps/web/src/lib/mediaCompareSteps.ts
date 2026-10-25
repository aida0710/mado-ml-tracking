// Run × stepのメディアの比較で出すstep。既定の列、選択肢に出す記録済みのstep、URLに残すstep、
// /media/compareの応答から組み立てる格子。
import { MEDIA_COMPARE_MAX_STEPS, type MediaCompareGrid, type RunMedia } from '@mmt/contracts';
import { sortedSteps } from './mediaSteps';

/**
 * すべてのRunが記録したstep（昇順）。そのキーで何も記録していないRunは除く。そうしたRunの行は
 * どの列でも空なので、ほかのRunの共通のstepを減らさせない。
 */
export function commonSteps(stepsByRun: readonly (readonly number[])[]): number[] {
  const recordingRuns = stepsByRun.filter((steps) => steps.length > 0);
  if (recordingRuns.length === 0) return [];
  const [first, ...rest] = recordingRuns.map((steps) => new Set(steps));
  return sortedSteps([...first!].filter((step) => rest.every((steps) => steps.has(step))));
}

/**
 * 比較を開いたときの列。すべてのRunが記録した最新のstepにして、既定の格子に空のセルを作らない。
 * Runに共通のstepが無ければ[]（各Runの最新のstep）。
 */
export function defaultComparisonSteps(stepsByRun: readonly (readonly number[])[]): number[] {
  const latestCommon = commonSteps(stepsByRun).at(-1);
  return latestCommon === undefined ? [] : [latestCommon];
}

/** 記録済みのstepと、比べるRunのうちそれを記録したRunの数。 */
export interface StepCoverage {
  step: number;
  runCount: number;
}

/** どれかのRunが記録したすべてのstepを昇順に、それを記録したRunの数とともに並べたもの。 */
export function stepCoverage(stepsByRun: readonly (readonly number[])[]): StepCoverage[] {
  const counts = new Map<number, number>();
  for (const steps of stepsByRun) for (const step of new Set(steps)) counts.set(step, (counts.get(step) ?? 0) + 1);
  return sortedSteps(counts.keys()).map((step) => ({ step, runCount: counts.get(step)! }));
}

/** 選んだstepに`step`を入れるか外したもの（昇順）。 */
export function withStepToggled(steps: readonly number[], step: number): number[] {
  return steps.includes(step) ? steps.filter((item) => item !== step) : sortedSteps([...steps, step]);
}

export type StepListParseResult = { ok: true; steps: number[] } | { ok: false; error: 'invalid' | 'too_many' };

/**
 * カンマ区切りのstepの一覧（"0, 500, 1000"）。重複は捨てる。異なるstepが
 * MEDIA_COMPARE_MAX_STEPSを超えたら切り詰めずに断り、求めたstepを格子が黙って隠すことが
 * ないようにする。
 */
export function parseStepList(input: string): StepListParseResult {
  const parts = input
    .split(/[\s,、]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (!parts.every((part) => /^\d+$/.test(part) && Number.isSafeInteger(Number(part)))) return { ok: false, error: 'invalid' };
  const steps = sortedSteps(parts.map(Number));
  if (steps.length > MEDIA_COMPARE_MAX_STEPS) return { ok: false, error: 'too_many' };
  return { ok: true, steps };
}

/** 各Runの最新のstepを求めるURLの値。パラメータが無ければ既定の列。 */
export const LATEST_STEPS_PARAM_VALUE = 'latest';

/**
 * URLに残した比較のstep。既定の列ならnull（壊れた一覧や長すぎる一覧もnull）、各Runの最新の
 * stepなら[]、それ以外は一覧のstep。
 */
export function parseStepsParam(value: string | null): number[] | null {
  if (value === null) return null;
  if (value === LATEST_STEPS_PARAM_VALUE) return [];
  const parsed = parseStepList(value);
  return parsed.ok && parsed.steps.length > 0 ? parsed.steps : null;
}

/** 選んだstepのURLの値。nullならパラメータを消す（既定の列）。 */
export function stepsParamOf(steps: readonly number[] | null): string | null {
  if (steps === null) return null;
  return steps.length === 0 ? LATEST_STEPS_PARAM_VALUE : steps.join(',');
}

/** 比較の格子の列。全Runで同じ1つのstepか、各Runそれぞれの最新のstep。 */
export type CompareColumn = { kind: 'step'; step: number } | { kind: 'latest' };

/** /media/compareの応答を長方形に並べたもの（cells[runIndex][columnIndex]）。 */
export interface CompareTable {
  runIds: string[];
  columns: CompareColumn[];
  cells: Array<Array<RunMedia[] | null>>;
}

/**
 * 比較の格子を組み立てる。求めたstepがあれば、行は既にそろっている。無ければ各行がそのRunの
 * 最新のstepを持ち、最新のstepを1つの列にまとめて、各セルは記録したときのstepを持ったままにする。
 * stepごとに1列ずつ広げると、行のほかのセルがすべて空になるため。すべてのRunが同じstepで
 * 終わっていれば、その列は単にそのstep。
 */
export function compareTableOf(grid: MediaCompareGrid): CompareTable {
  const runIds = grid.rows.map((row) => row.runId);
  if (grid.steps !== null)
    return { runIds, columns: grid.steps.map((step) => ({ kind: 'step', step })), cells: grid.rows.map((row) => row.cells) };
  const latestSteps = sortedSteps(grid.rows.flatMap((row) => row.cells[0]?.map((item) => item.step) ?? []));
  return {
    runIds,
    columns: [latestSteps.length === 1 ? { kind: 'step', step: latestSteps[0]! } : { kind: 'latest' }],
    cells: grid.rows.map((row) => [row.cells[0] ?? null]),
  };
}
