import type {
  Artifact,
  ArtifactUpload,
  ArtifactUploadCreate,
  ArtifactUploadDetail,
  ArtifactUploadListItem,
  ArtifactUploadPart,
  ArtifactUploadStatus,
} from '@mmt/contracts';
import {
  ARTIFACT_TOO_LARGE_CODE,
  encodeId,
  invalidResponseError,
  jsonRequest,
  NETWORK_ERROR_CODE,
  projectPath,
  request,
  RequestError,
  requestErrorFromBody,
  requestItems,
} from './http';

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
 * 失敗はapi/http.tsと同じRequestErrorにして、lib/errorMessage.tsが画面に出せるようにする。
 */
function sendWithProgress<T>(
  { method, path, body, headers }: { method: 'PUT'; path: string; body: Blob | ArrayBuffer; headers: Record<string, string> },
  { signal, onProgress }: TransferOptions,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
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
    xhr.open(method, `/api${path}`);
    xhr.withCredentials = true;
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onabort = () => settle(() => reject(new DOMException('Upload aborted', 'AbortError')));
    xhr.onerror = () => settle(() => reject(new RequestError({ status: 0, code: NETWORK_ERROR_CODE })));
    xhr.onload = () =>
      settle(() => {
        const payload = parseJson(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300) reject(responseError(xhr.status, payload));
        else if (payload === null) reject(invalidResponseError(xhr.status));
        else resolve(payload as T);
      });
    xhr.send(body);
  });
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function responseError(status: number, payload: unknown): RequestError {
  // 手前のプロキシがAPIより先にHTMLで断ることがあるため、413はstatusだけでコードを決める。
  if (status === HTTP_PAYLOAD_TOO_LARGE) return new RequestError({ status, code: ARTIFACT_TOO_LARGE_CODE });
  return requestErrorFromBody(status, payload);
}

export const artifactUploadsApi = {
  list: (projectId: string, status: ArtifactUploadStatus, signal?: AbortSignal) =>
    requestItems<ArtifactUploadListItem>(`${uploadsPath(projectId)}?${new URLSearchParams({ status })}`, signal),
  get: (projectId: string, uploadId: string, signal?: AbortSignal) =>
    request<ArtifactUploadDetail>(uploadPath(projectId, uploadId), { signal }),
  create: (projectId: string, body: ArtifactUploadCreate, signal?: AbortSignal) =>
    request<ArtifactUpload>(uploadsPath(projectId), { ...jsonRequest('POST', body), signal }),
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
    sendWithProgress<ArtifactUploadPart>(
      {
        method: 'PUT',
        path: `${uploadPath(projectId, uploadId)}/parts/${partNumber}`,
        body,
        headers: {
          'Content-Type': 'application/octet-stream',
          ...(sha256 ? { [PART_SHA256_HEADER]: sha256 } : {}),
        },
      },
      options,
    ),
  complete: (projectId: string, uploadId: string, signal?: AbortSignal) =>
    request<ArtifactUpload>(`${uploadPath(projectId, uploadId)}/complete`, { method: 'POST', signal }),
  abort: (projectId: string, uploadId: string) =>
    request<ArtifactUpload>(uploadPath(projectId, uploadId), { method: 'DELETE' }),
  /** 小さいファイル用の`PUT .../artifacts?path=`の1回のPUTを、進み具合つきで送る。 */
  putSingle: (
    { projectId, runId, path, file }: { projectId: string; runId: string | null; path: string; file: File },
    options: TransferOptions,
  ) =>
    sendWithProgress<Artifact>(
      {
        method: 'PUT',
        path: `${runId ? `${projectPath(projectId)}/runs/${encodeId(runId)}` : projectPath(projectId)}/artifacts?${new URLSearchParams({ path })}`,
        body: file,
        // ブラウザがFile.typeを空にしたときは、APIがパスから種類を推測する。
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      },
      options,
    ),
};
