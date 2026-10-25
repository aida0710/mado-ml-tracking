import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  PutObjectCommand,
  UploadPartCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { validateArtifactKey } from './artifactKey.js';
import {
  ArtifactPartCheck,
  ArtifactUploadNotFoundError,
  MULTIPART_MIN_PART_BYTES,
  orderedCompletionParts,
} from './artifactMultipart.js';
import { parseArtifactRange } from './artifactRange.js';
import { DEFAULT_MULTIPART_PART_SIZE_BYTES } from './storageBackendConfig.js';
import {
  ArtifactNotFoundError,
  type ArtifactMultipartStore,
  type ArtifactStore,
  type IncompleteMultipartUpload,
} from './artifactTypes.js';

// 同時に送るパートを2つにして、ストリーミングのアップロードのメモリをパートの大きさの2倍に抑える。
const MULTIPART_CONCURRENCY = 2;
// S3は5GiBを超える1回のPutObjectを拒む。それより大きいArtifactにはmultipartが要る。
export const MAX_SINGLE_PUT_BYTES = 5 * 1024 * 1024 * 1024;

/** 1回のPUTではS3が受け付ける大きさを超え、しかもその保存先ではmultipartが無効になっている。 */
export class SinglePutTooLargeError extends Error {
  constructor() {
    super(`Artifact exceeds the ${MAX_SINGLE_PUT_BYTES}-byte limit of a single S3 PUT`);
    this.name = 'SinglePutTooLargeError';
  }
}

function httpStatus(error: unknown): number | undefined {
  return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
}
function throwStorageError(error: unknown): never {
  if (['NoSuchKey', 'NotFound'].includes((error as Error)?.name) || httpStatus(error) === 404)
    throw new ArtifactNotFoundError();
  throw error;
}
function isUnknownUpload(error: unknown): boolean {
  return (error as Error)?.name === 'NoSuchUpload' || httpStatus(error) === 404;
}

export function createS3ArtifactStore({
  client,
  bucket,
  prefix = '',
  multipartPartSizeBytes = DEFAULT_MULTIPART_PART_SIZE_BYTES,
  multipartEnabled,
}: {
  client: S3Client;
  bucket: string;
  prefix?: string;
  /**
   * 1リクエストで流すアップロードのパートの大きさ。アップロードセッションはパートの大きさを
   * 自分で決める。
   */
  multipartPartSizeBytes?: number;
  /**
   * falseにすると、put()をすべて1回のPutObjectで送り、multipartのstoreを提供しない。そのため、
   * この保存先ではアップロードセッションを拒む。multipartのAPIが失敗するS3互換サービス向け。
   */
  multipartEnabled: boolean;
}): ArtifactStore {
  const keyPrefix = prefix ? `${prefix.replace(/\/$/, '')}/` : '';
  function objectKey(key: string): string {
    validateArtifactKey(key);
    return `${keyPrefix}${key}`;
  }

  const multipart: ArtifactMultipartStore = {
    async createMultipart({ key, mimeType }) {
      const created = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: bucket,
          Key: objectKey(key),
          ContentType: mimeType,
        }),
      );
      if (!created.UploadId) throw new Error('S3 did not return a multipart upload id');
      return { backendUploadId: created.UploadId };
    },
    async putPart({ key, backendUploadId, partNumber, body, size, sha256 }) {
      const check = new ArtifactPartCheck({ size, sha256 });
      // SDKは本文を自前のstreamで包み、本文のエラーを捕捉されない例外として投げ直す。また、途中で
      // 終わった本文を待ち続ける。そのため、SDKにはエラーを出さない別のstreamを読ませ、大きさの
      // 不一致や元のstreamの破損があればリクエストを中止する。
      const forwarded = new PassThrough();
      const request = new AbortController();
      let streamError: unknown;
      const stopRequest = (error: unknown) => {
        streamError ??= error;
        request.abort();
      };
      body.once('error', stopRequest);
      check.on('error', stopRequest);
      try {
        const uploaded = await client.send(
          new UploadPartCommand({
            Bucket: bucket,
            Key: objectKey(key),
            UploadId: backendUploadId,
            PartNumber: partNumber,
            ContentLength: size,
            Body: body.pipe(check).pipe(forwarded),
          }),
          { abortSignal: request.signal },
        );
        if (!uploaded.ETag) throw new Error('S3 did not return a part ETag');
        // digestが一致しなくても、このパートは保存されたまま残る。呼び出し側はこのパートで
        // 完了しないこと。
        return { ...check.finishCheck(), etag: uploaded.ETag };
      } catch (error) {
        check.destroy();
        forwarded.destroy();
        if (streamError) throw streamError;
        if (isUnknownUpload(error)) throw new ArtifactUploadNotFoundError();
        throw error;
      } finally {
        body.off('error', stopRequest);
      }
    },
    async completeMultipart(completion) {
      const parts = orderedCompletionParts(completion, MULTIPART_MIN_PART_BYTES);
      try {
        await client.send(
          new CompleteMultipartUploadCommand({
            Bucket: bucket,
            Key: objectKey(completion.key),
            UploadId: completion.backendUploadId,
            MultipartUpload: {
              Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
            },
          }),
        );
      } catch (error) {
        if (isUnknownUpload(error)) throw new ArtifactUploadNotFoundError();
        throw error;
      }
    },
    async abortMultipart({ key, backendUploadId }) {
      try {
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: objectKey(key),
            UploadId: backendUploadId,
          }),
        );
      } catch (error) {
        if (!isUnknownUpload(error)) throw error;
      }
    },
    async listIncompleteUploads() {
      const uploads: IncompleteMultipartUpload[] = [];
      let keyMarker: string | undefined;
      let uploadIdMarker: string | undefined;
      do {
        const page = await client.send(
          new ListMultipartUploadsCommand({
            Bucket: bucket,
            Prefix: keyPrefix || undefined,
            KeyMarker: keyMarker,
            UploadIdMarker: uploadIdMarker,
          }),
        );
        for (const upload of page.Uploads ?? []) {
          if (!upload.Key || !upload.UploadId || !upload.Initiated) continue;
          uploads.push({
            key: upload.Key.slice(keyPrefix.length),
            backendUploadId: upload.UploadId,
            initiatedAt: upload.Initiated,
          });
        }
        keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
        uploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined;
      } while (keyMarker);
      return uploads;
    },
    // S3は書きかけのオブジェクトを見せない。中断した書き込みは未完了のアップロードとしてだけ残る。
    removeAbandonedStaging: async () => 0,
  };

  /**
   * 小さなオブジェクトは1回のPutObjectで、大きなものはmultipartアップロードで流す。失敗したら
   * AbortMultipartUploadを送って終わるのを待ってからrejectするので、リクエストの後にパートが
   * 残らない。
   */
  async function putObject(key: string, body: Readable, mimeType: string) {
    const digest = createHash('sha256');
    let size = 0;
    let buffered: Buffer[] = [];
    let bufferedBytes = 0;
    let upload: { key: string; backendUploadId: string } | undefined;
    const parts: { partNumber: number; size: number; etag: string }[] = [];
    let nextPartNumber = 1;
    const inFlight = new Set<Promise<void>>();
    async function sendPart(bytes: Buffer) {
      upload ??= { key, ...(await multipart.createMultipart({ key, mimeType })) };
      const partNumber = nextPartNumber++;
      const sending = multipart
        .putPart({ ...upload, partNumber, body: Readable.from([bytes]), size: bytes.length })
        .then(({ etag }) => {
          parts.push({ partNumber, size: bytes.length, etag });
        })
        .finally(() => inFlight.delete(sending));
      // 失敗はraceか最後のPromise.allから伝わる。unhandled rejectionにはしない。
      sending.catch(() => undefined);
      inFlight.add(sending);
      if (inFlight.size >= MULTIPART_CONCURRENCY) await Promise.race(inFlight);
    }
    try {
      for await (const chunk of body) {
        const bytes = Buffer.from(chunk as Uint8Array);
        digest.update(bytes);
        size += bytes.length;
        buffered.push(bytes);
        bufferedBytes += bytes.length;
        if (bufferedBytes < multipartPartSizeBytes) continue;
        const partBytes = Buffer.concat(buffered);
        buffered = [];
        bufferedBytes = 0;
        await sendPart(partBytes);
      }
      const lastBytes = Buffer.concat(buffered);
      if (!upload) {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: objectKey(key),
            Body: lastBytes,
            ContentType: mimeType,
          }),
        );
      } else {
        if (lastBytes.length > 0) await sendPart(lastBytes);
        await Promise.all(inFlight);
        await multipart.completeMultipart({ ...upload, parts });
      }
      return { size, sha256: digest.digest('hex') };
    } catch (error) {
      body.destroy();
      await Promise.allSettled(inFlight);
      if (upload) await multipart.abortMultipart(upload).catch(() => undefined);
      throw error;
    }
  }

  /**
   * PutObjectは送る前に長さが要り、Artifactはメモリよりはるかに大きいことがあるので、本文を先に
   * 一時ファイルへ書き出す。PUTが成功しても失敗しても、そのファイルは消す。
   */
  async function putSingleObject(key: string, body: Readable, mimeType: string) {
    const digest = createHash('sha256');
    let size = 0;
    const measure = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > MAX_SINGLE_PUT_BYTES) return callback(new SinglePutTooLargeError());
        digest.update(chunk);
        callback(null, chunk);
      },
    });
    const directory = await mkdtemp(path.join(tmpdir(), 'mmt-s3-put-'));
    const spoolPath = path.join(directory, 'body');
    try {
      await pipeline(body, measure, createWriteStream(spoolPath));
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey(key),
          Body: createReadStream(spoolPath),
          ContentLength: size,
          ContentType: mimeType,
        }),
      );
      return { size, sha256: digest.digest('hex') };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  return {
    async put({ key, body, mimeType }) {
      try {
        if (!multipartEnabled) return await putSingleObject(key, body, mimeType);
        return await putObject(key, body, mimeType);
      } catch (error) {
        throwStorageError(error);
      }
    },
    async read({ key, range }) {
      const Key = objectKey(key);
      try {
        const metadata = await client.send(new HeadObjectCommand({ Bucket: bucket, Key }));
        const totalSize = metadata.ContentLength;
        if (totalSize === undefined) throw new Error('Artifact size is unavailable');
        const bytes = parseArtifactRange(range, totalSize);
        const object = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key,
            ...(metadata.ETag ? { IfMatch: metadata.ETag } : {}),
            ...(bytes ? { Range: `bytes=${bytes.start}-${bytes.end}` } : {}),
          }),
        );
        if (!object.Body) throw new ArtifactNotFoundError();
        const body =
          object.Body instanceof Readable
            ? object.Body
            : Readable.from(object.Body as AsyncIterable<Uint8Array>);
        if (!bytes) return { body, size: totalSize, totalSize, status: 200 };
        return {
          body,
          size: bytes.end - bytes.start + 1,
          totalSize,
          status: 206,
          contentRange: `bytes ${bytes.start}-${bytes.end}/${totalSize}`,
        };
      } catch (error) {
        throwStorageError(error);
      }
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(key) }));
    },
    ...(multipartEnabled ? { multipart } : {}),
  };
}
