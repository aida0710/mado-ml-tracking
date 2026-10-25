import { createHash } from 'node:crypto';
import { Transform, type TransformCallback } from 'node:stream';
import type { MultipartCompletion } from './artifactTypes.js';

// S3は完了時に、最後以外の5 MiB未満のパートを拒否する。同じ規則にすることで、アップロード
// セッションがどの保存先でも同じように動く。
export const MULTIPART_MIN_PART_BYTES = 5 * 1024 * 1024;
// S3のUploadPartが1リクエストで受け付けるのは5 GiBまで。
export const MULTIPART_MAX_PART_BYTES = 5 * 1024 * 1024 * 1024;
// S3のパート番号は1から10000まで。
export const MULTIPART_MAX_PART_COUNT = 10_000;

export class ArtifactPartMismatchError extends Error {
  constructor(readonly mismatch: 'size' | 'sha256') {
    super(
      mismatch === 'size'
        ? 'Part body length differs from its declared size'
        : 'Part body digest differs from its declared SHA-256',
    );
    this.name = 'ArtifactPartMismatchError';
  }
}
/** 保存先がそのマルチパートアップロードをもう知らない（完了した、中止した、作られていない）。 */
export class ArtifactUploadNotFoundError extends Error {
  constructor() {
    super('Multipart upload does not exist');
    this.name = 'ArtifactUploadNotFoundError';
  }
}
export class ArtifactPartTooSmallError extends Error {
  constructor(readonly partNumber: number) {
    super(`Part ${partNumber} is below the minimum size of a non-final part`);
    this.name = 'ArtifactPartTooSmallError';
  }
}

/**
 * パートをストレージへストリームで送りながらハッシュを取り、長さが宣言したサイズと合わなく
 * なった時点でストリームを失敗させる。そのため、短すぎる本文や長すぎる本文が保存済みのパートに
 * なることはない。
 */
export class ArtifactPartCheck extends Transform {
  private readonly hash = createHash('sha256');
  private receivedBytes = 0;

  constructor(private readonly expected: { size: number; sha256?: string }) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    this.receivedBytes += chunk.byteLength;
    if (this.receivedBytes > this.expected.size) {
      callback(new ArtifactPartMismatchError('size'));
      return;
    }
    this.hash.update(chunk);
    callback(null, chunk);
  }

  override _flush(callback: TransformCallback) {
    callback(
      this.receivedBytes === this.expected.size ? null : new ArtifactPartMismatchError('size'),
    );
  }

  /** ストリームが終わってから呼ぶ。宣言したダイジェストと一致しなければ例外を投げる。 */
  finishCheck(): { size: number; sha256: string } {
    const sha256 = this.hash.digest('hex');
    if (this.expected.sha256 && this.expected.sha256 !== sha256)
      throw new ArtifactPartMismatchError('sha256');
    return { size: this.receivedBytes, sha256 };
  }
}

/** 最後以外のパートの最小サイズを確かめてから、組み立てる順にパートを返す。 */
export function orderedCompletionParts(
  completion: MultipartCompletion,
  minimumPartBytes: number,
): MultipartCompletion['parts'] {
  const parts = [...completion.parts].sort((left, right) => left.partNumber - right.partNumber);
  parts.slice(0, -1).forEach((part) => {
    if (part.size < minimumPartBytes) throw new ArtifactPartTooSmallError(part.partNumber);
  });
  return parts;
}
