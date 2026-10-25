import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import type { ApiContext } from './request.js';

/**
 * 保存先へ書き込むための、Nodeのストリームとしてのリクエストの本文。権限の検査中にクライアントが
 * 切断すると、保存先が読む前にストリームが破棄される。リスナーが無いとそのエラーは捕捉されず、
 * プロセスが止まる。それでも保存先は破棄されたストリームに気づいて失敗する。
 */
export function requestBodyStream(context: ApiContext): Readable {
  const body = context.req.raw.body;
  const readable = body ? Readable.fromWeb(body as ReadableStream<Uint8Array>) : Readable.from([]);
  readable.on('error', () => undefined);
  return readable;
}

/** 生のアップロードのContent-Length。保存先は本文を読む前に大きさを知る必要がある。 */
export function declaredContentLength(context: ApiContext): number | undefined {
  const header = context.req.header('Content-Length');
  return header && /^\d+$/.test(header) ? Number(header) : undefined;
}
