import { useState } from 'react';
import type { Artifact } from '@mmt/contracts';
import { artifactPreviewsApi } from '../api/artifactPreviews';
import { trackingApi } from '../api/tracking';
import { summarizeServerAudioPreviews, type ServerWaveform } from '../lib/serverAudioPreview';
import { EXECUTION_POLL_MS, useQuery } from './useQuery';

export type ServerAudioPreviewState =
  | { status: 'none' | 'pending' | 'failed' }
  | { status: 'ready'; waveform: ServerWaveform; spectrogramUrl: string | null };

/**
 * ブラウザが解析しない音声のArtifactについて、サーバーが作った波形とスペクトログラム。プレビューの
 * workerがまだ作っている間はポーリングする。要求が失敗したら'none'として扱う。プレビューが無くても
 * 再生はできるので、エラーは出さない。
 */
export function useServerAudioPreview(
  artifact: Pick<Artifact, 'projectId' | 'id'>,
  enabled: boolean,
): ServerAudioPreviewState {
  const listKey = enabled ? `${artifact.projectId}/${artifact.id}` : null;
  // プレビューが出そろったキー。そのキーではポーリングを止め、別のArtifactでは再び始める。
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const previews = useQuery({
    key: listKey,
    load: (signal) => artifactPreviewsApi.list(artifact.projectId, artifact.id, signal),
    pollMs: settledKey === listKey ? undefined : EXECUTION_POLL_MS,
  });
  const summary = previews.value ? summarizeServerAudioPreviews(previews.value) : null;
  // 要求が失敗してもポーリングを止める。そのときビューアーはプレビュー無しでファイルを再生する。
  const isSettled = (summary !== null && summary.status !== 'pending') || previews.error !== null;
  if (isSettled && settledKey !== listKey) setSettledKey(listKey);

  const peaksArtifactId = summary?.status === 'ready' ? summary.peaksArtifactId : null;
  const waveform = useQuery({ key: peaksArtifactId, load: (signal) =>
    artifactPreviewsApi.waveform(artifact.projectId, peaksArtifactId!, signal),
  });
  if (!summary) return { status: previews.loading ? 'pending' : 'none' };
  if (summary.status !== 'ready') return { status: summary.status };
  if (!waveform.value) return { status: waveform.error ? 'none' : 'pending' };
  return {
    status: 'ready',
    waveform: waveform.value,
    spectrogramUrl: summary.spectrogramArtifactId
      ? trackingApi.artifactUrl(artifact.projectId, summary.spectrogramArtifactId)
      : null,
  };
}
