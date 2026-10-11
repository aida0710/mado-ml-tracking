/**
 * A response body that reads the next chunk only when the client asks for it (highWaterMark 0), so
 * nothing is read from the DB ahead of a slow download, and stops reading when it disconnects.
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
