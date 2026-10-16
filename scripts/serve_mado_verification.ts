/** A disposable real Tracking API + DB, alongside real Mado routes with a Registry fixture. */
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { serve } from '@hono/node-server';
import type { Experiment, Project } from '@mmt/contracts';
import { createHarness, entity, request } from '../apps/api/test/harness.js';
import { startMadoVerificationServer } from './fixtures/madoVerificationServer.js';

// Dedicated ports keep this verifier separate from the shared development servers.
const DEFAULT_VERIFICATION_API_PORT = 6083;
const DEFAULT_VERIFICATION_WEB_PORT = 6084;
const port = Number(process.env.MMT_VERIFY_API_PORT ?? DEFAULT_VERIFICATION_API_PORT);
const webPort = Number(process.env.MMT_VERIFY_WEB_PORT ?? DEFAULT_VERIFICATION_WEB_PORT);
const mado = await startMadoVerificationServer();
const settingsFile = path.resolve('var/builtin-mado-verification.json');
let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
let server: ReturnType<typeof serve> | undefined;
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const activeServer = server;
  if (activeServer)
    await new Promise<void>((resolve, reject) =>
      activeServer.close((error) => (error ? reject(error) : resolve())),
    );
  await harness?.close();
  await mado.close();
  await unlink(settingsFile).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

try {
  harness = await createHarness({
    environment: {
      MMT_PUBLIC_URL: `http://127.0.0.1:${port}`,
      MMT_WEB_ORIGIN: `http://127.0.0.1:${webPort}`,
      MMT_PLUGIN_SECRET_KEY: randomBytes(32).toString('base64'),
    },
  });
  const originHeaders = { Origin: `http://127.0.0.1:${webPort}` };
  const loginResponse = await request(harness.app, '/api/auth/dev-login', {
    method: 'POST',
    body: { email: 'admin@localhost' },
    headers: originHeaders,
  });
  await entity(loginResponse, 200);
  const administrator = { cookie: loginResponse.headers.get('Set-Cookie')!.split(';')[0]! };
  const project = await entity<Project>(
    await request(harness.app, '/api/projects', {
      method: 'POST',
      cookie: administrator.cookie,
      headers: originHeaders,
      body: { name: 'Mado内蔵連携の確認' },
    }),
  );
  const experiment = await entity<Experiment>(
    await request(harness.app, `/api/projects/${project.id}/experiments`, {
      method: 'POST',
      cookie: administrator.cookie,
      headers: originHeaders,
      body: { name: 'MadoへのRun送信' },
    }),
  );
  // A local browser verifier reads these short-lived fixture credentials. They are never printed or photographed.
  await mkdir(path.dirname(settingsFile), { recursive: true, mode: 0o700 });
  await writeFile(
    settingsFile,
    JSON.stringify({
      projectId: project.id,
      experimentId: experiment.id,
      madoUrl: mado.url,
      credentials: { accessToken: mado.accessToken },
      madoVersionId: mado.versionId,
    }),
    { mode: 0o600 },
  );
  harness.outbox.start();
  server = serve({ hostname: '127.0.0.1', port, fetch: harness.app.fetch });
  console.log(JSON.stringify({ event: 'mado_verification_ready', port, projectId: project.id }));
  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
} catch (error) {
  await shutdown();
  throw error;
}
