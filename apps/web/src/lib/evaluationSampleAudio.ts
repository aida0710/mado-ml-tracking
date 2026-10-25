// 評価サンプルのaudioのセルに出すもの。pathが指すArtifactか、それが無い理由。

import type { Artifact } from '@mmt/contracts';
import type { ArtifactReferenceError, ArtifactReferenceResult } from './evaluationSamples';

/** 1ページ分のサンプルが参照するRunのArtifactを、Run、pathの順に引けるようにしたもの。Artifactの一覧を取れなかったRunは'unavailable'。 */
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
