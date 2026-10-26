import {
  ApiError,
  ApiErrorBodySchema,
  apiErrorFromResponse,
  INVALID_RESPONSE_CODE,
  jsonRequestInit,
  NETWORK_ERROR_CODE,
  requestJson,
} from '@mado/design-system/http';
import type { ArtifactUploadCreate, ArtifactUploadStatus } from '@mmt/contracts';
import {
  artifactSchema,
  artifactUploadDetailSchema,
  artifactUploadListItemSchema,
  artifactUploadPartSchema,
  artifactUploadSchema,
  itemsOf,
} from '@mmt/contracts/schemas';
import { z } from 'zod';
import { ARTIFACT_TOO_LARGE_CODE, encodeId, projectPath } from './http';

const HTTP_PAYLOAD_TOO_LARGE = 413;
// apps/api/src/routes/artifactUploadRoutes.tsのPART_SHA256_HEADERと同じヘッダー名。
const PART_SHA256_HEADER = 'X-Part-SHA256';

const uploadsPath = (projectId: string) => `${projectPath(projectId)}/artifact-uploads`;
const uploadPath = (projectId: string, uploadId: string) =>
  `${uploadsPath(projectId)}/${encodeId(uploadId)}`;

export interface TransferOptions {
  signal: AbortSignal;
  /** この要求の本文のうち、ここまでに送ったバイト数。 */
  onProgress: (sentBytes: number) => void;
}

/**
 * fetch()はアップロードの進み具合を知らせられないので、要求の本文はXMLHttpRequestで送る。
 * 応答はrequestJsonと同じくスキーマで確かめ、失敗はApiErrorにする。
 */
function sendWithProgress<Schema extends z.ZodType>(
  {
    url,
    body,
    headers,
    schema,
  }: { url: string; body: Blob | ArrayBuffer; headers: Record<string, string>; schema: Schema },
  { signal, onProgress }: TransferOptions,
): Promise<z.infer<Schema>> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Upload aborted', 'AbortError'));
      return;
    }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal.addEventListener('abort', abort, { once: true });
    const settle = (finish: () => void) => {
      signal.removeEventListener('abort', abort);
      finish();
    };
    xhr.open('PUT', url);
    xhr.withCredentials = true;
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onabort = () => settle(() => reject(new DOMException('Upload aborted', 'AbortError')));
    xhr.onerror = () =>
      settle(() => reject(new ApiError({ status: 0, code: NETWORK_ERROR_CODE, message: 'Upload request failed' })));
    xhr.onload = () =>
      settle(() => {
        const payload = parseJson(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(failedUploadError(xhr, payload));
          return;
        }
        const parsed = schema.safeParse(payload);
        if (parsed.success) resolve(parsed.data);
        else
          reject(
            new ApiError({ status: xhr.status, code: INVALID_RESPONSE_CODE, message: z.prettifyError(parsed.error) }),
          );
      });
    xhr.send(body);
  });
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function failedUploadError(xhr: XMLHttpRequest, payload: unknown): ApiError {
  const failure = apiErrorFromResponse(xhr.status, xhr.statusText, payload);
  if (xhr.status !== HTTP_PAYLOAD_TOO_LARGE || ApiErrorBodySchema.safeParse(payload).success) return failure;
  // 手前のプロキシがAPIより先にHTMLで断ると、APIの文が無い。画面の言語の文で出すためcodeを付ける。
  return new ApiError({ status: failure.status, code: ARTIFACT_TOO_LARGE_CODE, message: failure.message });
}

export const artifactUploadsApi = {
  list: async (projectId: string, status: ArtifactUploadStatus, signal?: AbortSignal) =>
    (
      await requestJson(`${uploadsPath(projectId)}?${new URLSearchParams({ status })}`, {
        schema: itemsOf(artifactUploadListItemSchema),
        init: { signal },
      })
    ).items,
  get: (projectId: string, uploadId: string, signal?: AbortSignal) =>
    requestJson(uploadPath(projectId, uploadId), { schema: artifactUploadDetailSchema, init: { signal } }),
  create: (projectId: string, body: ArtifactUploadCreate, signal?: AbortSignal) =>
    requestJson(uploadsPath(projectId), {
      schema: artifactUploadSchema,
      init: { ...jsonRequestInit('POST', body), signal },
    }),
  putPart: (
    { projectId, uploadId, partNumber, body, sha256 }: {
      projectId: string;
      uploadId: string;
      partNumber: number;
      body: Blob | ArrayBuffer;
      /** 小文字の16進のdigest。ブラウザにWeb Cryptoが無いとき（平文のhttpのorigin）は付けない。 */
      sha256: string | null;
    },
    options: TransferOptions,
  ) =>
    sendWithProgress(
      {
        url: `${uploadPath(projectId, uploadId)}/parts/${partNumber}`,
        body,
        headers: {
          'Content-Type': 'application/octet-stream',
          ...(sha256 ? { [PART_SHA256_HEADER]: sha256 } : {}),
        },
        schema: artifactUploadPartSchema,
      },
      options,
    ),
  complete: (projectId: string, uploadId: string, signal?: AbortSignal) =>
    requestJson(`${uploadPath(projectId, uploadId)}/complete`, {
      schema: artifactUploadSchema,
      init: { method: 'POST', signal },
    }),
  abort: (projectId: string, uploadId: string) =>
    requestJson(uploadPath(projectId, uploadId), { schema: artifactUploadSchema, init: { method: 'DELETE' } }),
  /** 小さいファイル用の`PUT .../artifacts?path=`の1回のPUTを、進み具合つきで送る。 */
  putSingle: (
    { projectId, runId, path, file }: { projectId: string; runId: string | null; path: string; file: File },
    options: TransferOptions,
  ) =>
    sendWithProgress(
      {
        url: `${runId ? `${projectPath(projectId)}/runs/${encodeId(runId)}` : projectPath(projectId)}/artifacts?${new URLSearchParams({ path })}`,
        body: file,
        // ブラウザがFile.typeを空にしたときは、APIがパスから種類を推測する。
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        schema: artifactSchema,
      },
      options,
    ),
};
