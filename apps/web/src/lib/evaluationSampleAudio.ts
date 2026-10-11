// What the audio cell of an evaluation sample shows: the Artifact its path names, or why there is none.

import type { Artifact } from '@mmt/contracts';
import type { ArtifactReferenceError, ArtifactReferenceResult } from './evaluationSamples';

/** Artifacts of the Runs a page of samples refers to, by Run and then by path; 'unavailable' when the Run could not be listed. */
export type RunArtifactIndex = Map<string, Map<string, Artifact> | 'unavailable'>;

export type SampleAudio =
  | { kind: 'none' }
  | { kind: 'reference_error'; error: ArtifactReferenceError }
  | { kind: 'lookup_error' }
  | { kind: 'pending' }
  | { kind: 'run_unavailable' }
  | { kind: 'not_found' }
  | { kind: 'found'; artifact: Artifact };

export function lookupSampleAudio(
  resolved: ArtifactReferenceResult | null,
  index: { value: RunArtifactIndex | undefined; error: string | null },
): SampleAudio {
  if (!resolved) return { kind: 'none' };
  if (!resolved.ok) return { kind: 'reference_error', error: resolved.error };
  if (index.error) return { kind: 'lookup_error' };
  const runArtifacts = index.value?.get(resolved.reference.runId);
  if (!runArtifacts) return { kind: 'pending' };
  if (runArtifacts === 'unavailable') return { kind: 'run_unavailable' };
  const artifact = runArtifacts.get(resolved.reference.path);
  return artifact ? { kind: 'found', artifact } : { kind: 'not_found' };
}
