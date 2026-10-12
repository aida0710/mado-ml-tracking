/** Import the legacy bridge's delivery hashes without exposing API credentials or changing its ledger. */
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

// The authorized import endpoint accepts at most this many hashes in one transaction.
const RECEIPT_BATCH_SIZE = 1000;
// Bound the read of a ledger file; each valid record contains only a 64-character digest.
const MAX_LEDGER_FILE_BYTES = 4096;
const API_REQUEST_DEADLINE_MS = 10000;
const [projectId, pluginId, directory] = process.argv.slice(2);
if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(pluginId).success || !directory)
  throw new Error('Usage: import_plugin_receipts.ts <project-id> <plugin-id> <ledger-directory>');
const token = process.env.MMT_API_TOKEN;
if (!token) throw new Error('MMT_API_TOKEN is required');
const origin = new URL(process.env.MMT_API_URL ?? 'http://127.0.0.1:4182');
if (
  !['http:', 'https:'].includes(origin.protocol) ||
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash ||
  origin.pathname !== '/'
)
  throw new Error('MMT_API_URL must be an HTTP origin without credentials');
const receipts: { eventId: string; payloadHash: string }[] = [];
async function readLedgerDigest(filename: string): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of createReadStream(filename, {
    highWaterMark: MAX_LEDGER_FILE_BYTES + 1,
  })) {
    bytes += chunk.length;
    if (bytes > MAX_LEDGER_FILE_BYTES) throw new Error('Invalid legacy ledger size');
    chunks.push(chunk);
  }
  let ledger: unknown;
  try {
    ledger = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Invalid legacy ledger format');
  }
  const parsed = z.object({ digest: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(ledger);
  if (!parsed.success) throw new Error('Invalid legacy ledger digest');
  return parsed.data.digest;
}
for (const filename of (await readdir(directory)).sort()) {
  const eventId = filename.replace(/\.json$/, '');
  if (!filename.endsWith('.json') || !z.uuid().safeParse(eventId).success) continue;
  receipts.push({ eventId, payloadHash: await readLedgerDigest(path.join(directory, filename)) });
}
let imported = 0;
for (let offset = 0; offset < receipts.length; offset += RECEIPT_BATCH_SIZE) {
  const response = await fetch(
    new URL(`/api/projects/${projectId}/plugins/${pluginId}/events/receipts`, origin),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipts: receipts.slice(offset, offset + RECEIPT_BATCH_SIZE) }),
      redirect: 'error',
      signal: AbortSignal.timeout(API_REQUEST_DEADLINE_MS),
    },
  );
  if (!response.ok)
    throw new Error(
      `Receipt import stopped at HTTP ${response.status}; completed batches remain saved`,
    );
  const parsed = z
    .object({ imported: z.number().int().nonnegative() })
    .parse(await response.json());
  imported += parsed.imported;
}
console.log(JSON.stringify({ checked: receipts.length, imported }));
