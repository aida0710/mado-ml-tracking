import { ApiError, apiErrorFromResponse, NETWORK_ERROR_CODE } from '@mado/design-system/http';

/*
 * APIの経路と、本文をJSONとして読まない取得。JSONの応答は@mado/design-system/httpのrequestJsonで読み、
 * @mmt/contracts/schemasのスキーマで確かめる。
 */

// 手前のプロキシがAPIより先にHTMLで413を返すと、APIの文が無い。画面の言語の文で出すため、画面でcodeを付ける。
export const ARTIFACT_TOO_LARGE_CODE = 'artifact_too_large';

export const encodeId = encodeURIComponent;
export const projectPath = (projectId: string) => `/api/projects/${encodeId(projectId)}`;

/**
 * 本文をJSONとして読まない取得（Artifactの中身、CSV）。成功の応答をそのまま返し、通信の失敗と失敗の応答は
 * requestJsonと同じApiErrorにする。呼び出しを止めたときは、ブラウザのAbortErrorをそのまま投げる。
 */
export async function fetchApiResponse(url: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'include', ...init });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError({
      status: 0,
      code: NETWORK_ERROR_CODE,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  if (!response.ok)
    throw apiErrorFromResponse(response.status, response.statusText, await response.json().catch(() => undefined));
  return response;
}
