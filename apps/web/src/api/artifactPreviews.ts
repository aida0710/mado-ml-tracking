import { ApiError, INVALID_RESPONSE_CODE, requestJson } from '@mado/design-system/http';
import { artifactPreviewSchema, itemsOf } from '@mmt/contracts/schemas';
import { parseWaveformPeaksPreview, type ServerWaveform } from '../lib/serverAudioPreview';
import { encodeId, projectPath } from './http';
import { trackingApi } from './tracking';

export const artifactPreviewsApi = {
  /** 長い音声・動画のためにサーバーが作ったプレビュー。要らなかったときは空。 */
  list: async (projectId: string, artifactId: string, signal?: AbortSignal) =>
    (
      await requestJson(`${projectPath(projectId)}/artifacts/${encodeId(artifactId)}/previews`, {
        schema: itemsOf(artifactPreviewSchema),
        init: { signal },
      })
    ).items,
  waveform: async (projectId: string, peaksArtifactId: string, signal?: AbortSignal): Promise<ServerWaveform> => {
    const waveform = parseWaveformPeaksPreview(await trackingApi.artifactText(projectId, peaksArtifactId, signal));
    if (!waveform)
      throw new ApiError({
        status: 200,
        code: INVALID_RESPONSE_CODE,
        message: `The waveform preview ${peaksArtifactId} is not a version 1 peaks document`,
      });
    return waveform;
  },
};
