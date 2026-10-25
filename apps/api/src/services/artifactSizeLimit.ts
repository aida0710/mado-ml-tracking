import { Transform, type TransformCallback } from 'node:stream';
import { DomainError } from '../domain/errors.js';

export function artifactTooLargeError(maxBytes: number): DomainError {
  return new DomainError({
    status: 413,
    code: 'artifact_too_large',
    message: `the artifact exceeds the size limit (${maxBytes} bytes)`,
    details: { maxBytes },
  });
}

/** 保存先に1バイトも書く前に、宣言されたContent-Lengthで拒む。 */
export function assertDeclaredArtifactSize(declaredBytes: number | undefined, maxBytes: number) {
  if (declaredBytes !== undefined && declaredBytes > maxBytes)
    throw artifactTooLargeError(maxBytes);
}

/**
 * 上限まではバイト列をそのまま通し、超えたらストリームを失敗させて保存のpipelineを中断させる。
 * chunkedのアップロードにはContent-Lengthが無いので、上限はこれだけになる。
 */
export class ArtifactSizeLimit extends Transform {
  private receivedBytes = 0;
  isExceeded = false;

  constructor(private readonly maxBytes: number) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    this.receivedBytes += chunk.length;
    if (this.receivedBytes > this.maxBytes) {
      this.isExceeded = true;
      callback(artifactTooLargeError(this.maxBytes));
      return;
    }
    callback(null, chunk);
  }
}
