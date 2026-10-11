import type { Experiment } from '@mmt/contracts';

/**
 * The listed Experiment with this name, compared as the API saves names (without the white space
 * at either end, letter case kept). Deleted Experiments are not listed, so the API may still
 * refuse a name this does not find.
 */
export function findExperimentNamed<T extends Pick<Experiment, 'name'>>(
  experiments: readonly T[],
  name: string,
): T | undefined {
  const wanted = name.trim();
  if (!wanted) return undefined;
  return experiments.find((experiment) => experiment.name === wanted);
}

/**
 * Active Runs recorded in the chosen Experiment, or in all of them when none is chosen. Undefined
 * until the Experiments arrive, so nothing is decided from a list still loading.
 */
export function recordedRunCount(
  experiments: readonly Pick<Experiment, 'id' | 'runCount'>[] | undefined,
  experimentId: string,
): number | undefined {
  if (!experiments) return undefined;
  if (experimentId)
    return experiments.find((experiment) => experiment.id === experimentId)?.runCount;
  return experiments.reduce((total, experiment) => total + experiment.runCount, 0);
}
