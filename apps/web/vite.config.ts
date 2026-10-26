import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// 検証の実行では、開発用のproxyの行き先を分離したAPIにする。既定は共有の開発API。
const apiProxyTarget = process.env.MMT_WEB_API_PROXY_TARGET ?? 'http://127.0.0.1:4182';

const webPackage = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// gitを、シェルを通さず決まった引数だけで呼ぶ。gitもリポジトリも無ければ空。
function readGit(args: string[]): string {
  try {
    return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

// 「このアプリについて」に出すビルドしたコミットとその日時。Dockerのビルドでは.gitを持ち込まないので
// ビルド引数（Dockerfile.webのMMT_GIT_COMMIT・MMT_GIT_DATE）で受け取り、ホストでのビルドではgitから読む。
const gitCommit = process.env.MMT_GIT_COMMIT?.trim() || readGit(['rev-parse', 'HEAD']);
const gitCommitDate = process.env.MMT_GIT_DATE?.trim() || readGit(['log', '-1', '--format=%cI']);

/**
 * MLflowのクライアントはこの開発サーバーを通してアップロードする（MLFLOW_TRACKING_URIはWebの
 * ポートを使う）。Nodeの既定のrequestTimeoutは5分で、1回のPUTで送る長いArtifactのアップロードを
 * APIが終わりを受け取る前に切ってしまう。APIは独自の無通信のタイムアウトを持つので、このポートに
 * 要求全体の期限は要らない。
 */
function removeRequestTimeout(httpServer: object | null) {
  if (httpServer && 'requestTimeout' in httpServer) httpServer.requestTimeout = 0;
}

function disableRequestTimeout(): Plugin {
  return {
    name: 'mmt-disable-request-timeout',
    configureServer(server) {
      removeRequestTimeout(server.httpServer);
    },
    configurePreviewServer(server) {
      removeRequestTimeout(server.httpServer);
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(webPackage.version),
    __GIT_COMMIT__: JSON.stringify(gitCommit),
    __GIT_DATE__: JSON.stringify(gitCommitDate),
  },
  plugins: [react(), disableRequestTimeout()],
  server: {
    host: '0.0.0.0',
    port: 5182,
    strictPort: true,
    // APIのpreflightは、ViteのアセットのCORSのミドルウェアでなく、APIのOriginの方針に任せる。
    cors: false,
    // /healthz は API の /api の外にあるヘルスチェック。web の nginx と同じく API へ渡す。
    proxy: { '/api': apiProxyTarget, '/healthz': apiProxyTarget },
  },
});
