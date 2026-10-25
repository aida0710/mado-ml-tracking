import { serve } from '@hono/node-server';
import { createApplication } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/database.js';
import { applyIdleTimeout, serverTimeouts } from './http/serverTimeouts.js';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
database.on('error', () => console.error(JSON.stringify({ event: 'database_pool_error' })));
const {
  app,
  outbox,
  automationSweeper,
  artifactUploadFinalizer,
  artifactGarbageCollector,
  sweepScheduler,
  notificationDispatcher,
  operationsMonitor,
  siteJobMonitor,
  hookSweeper,
  workflowScheduler,
} = createApplication({
  config,
  database,
});
// バックグラウンドの処理はサーバーと同じ期間動く。stop()は実行中の1回を待つ。
// garbage collectorは、毎回の回収の一部としてArtifactのアップロードのsweeperを動かす。
const backgroundTasks = [
  outbox,
  automationSweeper,
  artifactUploadFinalizer,
  artifactGarbageCollector,
  sweepScheduler,
  notificationDispatcher,
  operationsMonitor,
  siteJobMonitor,
  hookSweeper,
  workflowScheduler,
];
const timeouts = serverTimeouts(config);
const server = serve(
  {
    fetch: app.fetch,
    hostname: config.host,
    port: config.port,
    // Nodeの既定のrequestTimeout（5分）では、1回のPUTで送る長いArtifactのアップロードが切れる。
    serverOptions: timeouts.serverOptions,
  },
  (address) => console.log(`API listening on ${config.host}:${address.port}`),
);
applyIdleTimeout(server, timeouts);
for (const task of backgroundTasks) task.start();

let isClosing = false;
async function shutdown(): Promise<void> {
  if (isClosing) return;
  isClosing = true;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await Promise.all(backgroundTasks.map((task) => task.stop()));
  await database.end();
}
process.once('SIGTERM', () => {
  void shutdown();
});
process.once('SIGINT', () => {
  void shutdown();
});
