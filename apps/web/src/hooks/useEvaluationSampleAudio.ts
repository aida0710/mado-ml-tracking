import type { Artifact } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { resolveArtifactReference, type EvaluationSample } from '../lib/evaluationSamples';
import { lookupSampleAudio, type RunArtifactIndex, type SampleAudio } from '../lib/evaluationSampleAudio';
import { useQuery } from './useQuery';

/** Artifacts of the Runs referenced on the current page, keyed by Run and then by path. */
function useRunArtifactIndex(projectId: string, runIds: string[]) {
  const key = runIds.length ? `${projectId}:evaluation-audio:${runIds.join(',')}` : null;
  return useQuery({ key, load: async (signal) => {
    const entries = await Promise.all(
      runIds.map(async (runId): Promise<[string, Map<string, Artifact> | 'unavailable']> => {
        try {
          const artifacts = await trackingApi.artifacts(projectId, runId, signal);
          return [runId, new Map(artifacts.map((artifact) => [artifact.path, artifact]))];
        } catch (error) {
          if (signal.aborted) throw error;
          // A Run outside this Project (or deleted) answers 404; its rows show an error instead.
          return [runId, 'unavailable'];
        }
      }),
    );
    return new Map(entries) satisfies RunArtifactIndex;
  } });
}

/**
 * The audio Artifact of each shown sample, in the same order. Relative paths are read from the Run
 * that holds the table; only the Runs on this page are listed.
 */
export function useEvaluationSampleAudio(table: Artifact, samples: readonly EvaluationSample[]) {
  const references = samples.map((sample) =>
    sample.audio
      ? resolveArtifactReference(sample.audio, { projectId: table.projectId, tableRunId: table.runId })
      : null,
  );
  const runIds = Array.from(
    new Set(references.flatMap((result) => (result?.ok ? [result.reference.runId] : []))),
  ).sort();
  const index = useRunArtifactIndex(table.projectId, runIds);
  const audios: SampleAudio[] = references.map((reference) => lookupSampleAudio(reference, index));
  return { audios, error: index.error, reload: index.reload };
}
