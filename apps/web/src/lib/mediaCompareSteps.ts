// Which steps a Run × step media comparison shows: the default columns, the recorded steps offered
// as choices, the steps kept in the URL, and the grid laid out from a /media/compare response.
import { MEDIA_COMPARE_MAX_STEPS, type MediaCompareGrid, type RunMedia } from '@mmt/contracts';
import { sortedSteps } from './mediaSteps';

/**
 * Steps every Run recorded, ascending. Runs that recorded nothing for the key are left out: their
 * row is empty in any column, so they should not take the shared steps away from the others.
 */
export function commonSteps(stepsByRun: readonly (readonly number[])[]): number[] {
  const recordingRuns = stepsByRun.filter((steps) => steps.length > 0);
  if (recordingRuns.length === 0) return [];
  const [first, ...rest] = recordingRuns.map((steps) => new Set(steps));
  return sortedSteps([...first!].filter((step) => rest.every((steps) => steps.has(step))));
}

/**
 * The columns a comparison opens with: the latest step every Run recorded, so no cell of the
 * default grid is empty. [] (each Run's latest step) when the Runs share no step.
 */
export function defaultComparisonSteps(stepsByRun: readonly (readonly number[])[]): number[] {
  const latestCommon = commonSteps(stepsByRun).at(-1);
  return latestCommon === undefined ? [] : [latestCommon];
}

/** A recorded step and how many of the compared Runs recorded it. */
export interface StepCoverage {
  step: number;
  runCount: number;
}

/** Every step any Run recorded, ascending, with the number of Runs that recorded it. */
export function stepCoverage(stepsByRun: readonly (readonly number[])[]): StepCoverage[] {
  const counts = new Map<number, number>();
  for (const steps of stepsByRun) for (const step of new Set(steps)) counts.set(step, (counts.get(step) ?? 0) + 1);
  return sortedSteps(counts.keys()).map((step) => ({ step, runCount: counts.get(step)! }));
}

/** The chosen steps with `step` checked or unchecked, ascending. */
export function withStepToggled(steps: readonly number[], step: number): number[] {
  return steps.includes(step) ? steps.filter((item) => item !== step) : sortedSteps([...steps, step]);
}

export type StepListParseResult = { ok: true; steps: number[] } | { ok: false; error: 'invalid' | 'too_many' };

/**
 * A comma separated step list ("0, 500, 1000"). Duplicates are dropped; more than
 * MEDIA_COMPARE_MAX_STEPS distinct steps is refused rather than cut, so the grid never silently
 * hides a step that was asked for.
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

/** The URL value that asks for each Run's latest step; a missing parameter means the default columns. */
export const LATEST_STEPS_PARAM_VALUE = 'latest';

/**
 * Comparison steps kept in the URL: null for the default columns (also for a broken or too long
 * list), [] for each Run's latest step, otherwise the listed steps.
 */
export function parseStepsParam(value: string | null): number[] | null {
  if (value === null) return null;
  if (value === LATEST_STEPS_PARAM_VALUE) return [];
  const parsed = parseStepList(value);
  return parsed.ok && parsed.steps.length > 0 ? parsed.steps : null;
}

/** The URL value of chosen steps; null removes the parameter (the default columns). */
export function stepsParamOf(steps: readonly number[] | null): string | null {
  if (steps === null) return null;
  return steps.length === 0 ? LATEST_STEPS_PARAM_VALUE : steps.join(',');
}

/** A column of the comparison grid: one step for every Run, or each Run's own latest step. */
export type CompareColumn = { kind: 'step'; step: number } | { kind: 'latest' };

/** A /media/compare response laid out as a rectangle: cells[runIndex][columnIndex]. */
export interface CompareTable {
  runIds: string[];
  columns: CompareColumn[];
  cells: Array<Array<RunMedia[] | null>>;
}

/**
 * Lays out the comparison grid. With requested steps the rows already line up. Without them each
 * row holds its Run's latest step, and the latest steps share one column, each cell keeping the
 * step it was recorded at; spreading them over one column per step would leave every other cell
 * of a row empty. When all Runs ended at the same step, that column is simply that step.
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
