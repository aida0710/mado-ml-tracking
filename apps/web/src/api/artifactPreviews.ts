import type { ArtifactPreview } from '@mmt/contracts';
import { parseWaveformPeaksPreview, type ServerWaveform } from '../lib/serverAudioPreview';
import { encodeId, invalidResponseError, projectPath, requestItems } from './http';
import { trackingApi } from './tracking';

export const artifactPreviewsApi = {
  /** 長い音声・動画のためにサーバーが作ったプレビュー。要らなかったときは空。 */
  list: (projectId: string, artifactId: string, signal?: AbortSignal): Promise<ArtifactPreview[]> =>
    requestItems<ArtifactPreview>(`${projectPath(projectId)}/artifacts/${encodeId(artifactId)}/previews`, signal),
  waveform: async (projectId: string, peaksArtifactId: string, signal?: AbortSignal): Promise<ServerWaveform> => {
    const waveform = parseWaveformPeaksPreview(await trackingApi.artifactText(projectId, peaksArtifactId, signal));
    if (!waveform) throw invalidResponseError();
    return waveform;
  },
};
