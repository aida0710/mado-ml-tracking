import { ApiError, jsonRequestInit, requestJson, uploadWithProgress } from '@mado/design-system/http';
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
 * 進み具合を知らせながら送る（デザインシステムのuploadWithProgress）。手前のプロキシがAPIより先に
 * HTMLで413を返すとAPIの文が無いので、画面の言語の文で出すためのcodeを付ける。
 */
async function sendWithProgress<Schema extends z.ZodType>(
  { url, body, headers, schema }: { url: string; body: Blob | ArrayBuffer; headers: Record<string, string>; schema: Schema },
  { signal, onProgress }: TransferOptions,
): Promise<z.infer<Schema>> {
  try {
    return await uploadWithProgress({ url, body, headers, schema, signal, onProgress });
  } catch (error) {
    if (error instanceof ApiError && error.status === HTTP_PAYLOAD_TOO_LARGE && error.code === undefined)
      throw new ApiError({ status: error.status, code: ARTIFACT_TOO_LARGE_CODE, message: error.message });
    throw error;
  }
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
      init: jsonRequestInit('POST', body, { signal }),
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
