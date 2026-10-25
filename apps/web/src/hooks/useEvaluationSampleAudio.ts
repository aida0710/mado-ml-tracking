import type { Artifact } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { resolveArtifactReference, type EvaluationSample } from '../lib/evaluationSamples';
import { lookupSampleAudio, type RunArtifactIndex, type SampleAudio } from '../lib/evaluationSampleAudio';
import { useQuery } from './useQuery';

/** 今のページで参照しているRunのArtifact。Run、次にパスをキーにする。 */
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
          // このProjectの外の（または削除された）Runは404を返す。その行には代わりにエラーを出す。
          return [runId, 'unavailable'];
        }
      }),
    );
    return new Map(entries) satisfies RunArtifactIndex;
  } });
}

/**
 * 表示している各サンプルの音声のArtifact（同じ順）。相対パスは表を持つRunから読む。一覧に
 * するのはこのページのRunだけ。
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
