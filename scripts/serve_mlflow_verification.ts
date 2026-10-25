import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createHarness } from '../apps/api/test/harness.js';

// migrationをまだレビューしているあいだは、初期のSDKの検査をpreview環境のDBから切り離す。
const DEFAULT_VERIFICATION_PORT = 4184;
const verificationPort = Number(process.env.MMT_VERIFY_API_PORT ?? DEFAULT_VERIFICATION_PORT);
const harness = await createHarness();
// MLflowのmpu/completeはfinalizerを待つ。finalizerは、通常はサーバーがバックグラウンドで動かす。
harness.artifactUploadFinalizer.start();
// Sweepの早期終了（hyperband）はこのスケジューラで動く。Sweepを使う検査だけが有効にする。
const runsSweepScheduler = process.env.MMT_VERIFY_SWEEP_SCHEDULER === 'true';
if (runsSweepScheduler) harness.sweepScheduler.start();
const app = new Hono();
// multipartの検査は、SDKが送ったpartのリクエストを数える。ログに出すのはパスとステータスだけ。
app.use('/api/mlflow/*', async (context, next) => {
  await next();
  if (context.req.path.includes('/mlflow-artifacts/mpu/'))
    console.log(
      JSON.stringify({
        event: 'mlflow_multipart_request',
        method: context.req.method,
        path: context.req.path,
        status: context.res.status,
      }),
    );
});
app.route('/', harness.app);
const server = serve({ hostname: '127.0.0.1', port: verificationPort, fetch: app.fetch });
console.log(`MLflow verification API listening on 127.0.0.1:${verificationPort}`);

let isClosing = false;
async function shutdown(): Promise<void> {
  if (isClosing) return;
  isClosing = true;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await harness.artifactUploadFinalizer.stop();
  if (runsSweepScheduler) await harness.sweepScheduler.stop();
  await harness.close();
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
