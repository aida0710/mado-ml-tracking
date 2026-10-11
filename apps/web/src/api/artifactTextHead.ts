import { decodeUtf8Prefix } from '../lib/textPrefix';
import { ARTIFACT_CONTENT_UNAVAILABLE_CODE, NETWORK_ERROR_CODE, RequestError } from './http';
import { trackingApi } from './tracking';

/**
 * Reads at most `maxBytes` of the body. The content route answers a Range with 206, but a proxy
 * may still send the whole file with 200; reading stops at the limit either way.
 */
async function readLeadingBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const head = new Uint8Array(maxBytes);
  let length = 0;
  const reader = response.body?.getReader();
  if (!reader) return head.subarray(0, 0);
  while (length < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const taken = value.subarray(0, maxBytes - length);
    head.set(taken, length);
    length += taken.length;
  }
  await reader.cancel().catch(() => undefined);
  return head.subarray(0, length);
}

/** The first `maxBytes` of a text Artifact as text, cut at a whole character. */
export async function fetchArtifactTextHead(
  artifact: { projectId: string; artifactId: string; maxBytes: number },
  signal?: AbortSignal,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(trackingApi.artifactUrl(artifact.projectId, artifact.artifactId), {
      credentials: 'include',
      headers: { Range: `bytes=0-${artifact.maxBytes - 1}` },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new RequestError({ status: 0, code: NETWORK_ERROR_CODE });
  }
  if (!response.ok) throw new RequestError({ status: response.status, code: ARTIFACT_CONTENT_UNAVAILABLE_CODE });
  return decodeUtf8Prefix(await readLeadingBytes(response, artifact.maxBytes));
}
