/**
 * クライアントが求めたときにだけ次のチャンクを読む応答の本文（highWaterMark 0）。遅いダウンロード
 * より先にDBから読み進めることはなく、クライアントが切断すれば読むのをやめる。
 */
export function textStream(chunks: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const iterator = chunks[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      },
      async cancel() {
        await iterator.return?.();
      },
    },
    { highWaterMark: 0 },
  );
}
