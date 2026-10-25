import { clientApiUrl } from './clientApiUrl';
import { madoTrackingInstallLines } from './madoTrackingPackage';
import { exportLine, joinLines, promptedSecretLines, shellQuote } from './shellSnippet';

// pages/compute/worker.md: worker専用の仮想環境。`upgrade`はここへ入れ直す。Jobごとの
// GPUとメモリのメトリクスのためにtelemetryを付ける。
const WORKER_VENV_DIRECTORY = '~/.local/share/mado-tracking-worker/venv';
const WORKER_COMMAND = `${WORKER_VENV_DIRECTORY}/bin/mado-tracking-worker`;
const WORKER_INSTALL_EXTRAS = ['telemetry'];
// worker IDは再起動やアップグレードをまたいで変わってはいけない。workerのマシンの短いホスト名は
// 変わらず、たいていworker IDに使える文字（英字、数字、. _ -）でできていて、シェルが
// 埋めるので、コマンドをコピーしたまま実行できる。
const WORKER_ID_FROM_HOST_NAME = '"$(hostname -s)"';

/** このコンピュータのJobを受け取るworkerの入れ方。IDを埋めたコマンドで表す。 */
export interface WorkerSetupSnippets {
  install: string;
  service: string;
  environment: string;
}

export function buildWorkerSetupSnippets(settings: {
  origin: string;
  targetId: string;
}): WorkerSetupSnippets {
  const apiUrl = clientApiUrl(settings.origin);
  return {
    install: joinLines(
      madoTrackingInstallLines({
        venvDirectory: WORKER_VENV_DIRECTORY,
        extras: WORKER_INSTALL_EXTRAS,
      }),
    ),
    // `install`はtokenを自分で尋ね、実行したユーザーだけが読めるファイルに書く。
    service: joinLines([
      `${WORKER_COMMAND} install \\`,
      `  --api-url ${shellQuote(apiUrl)} \\`,
      `  --worker-id ${WORKER_ID_FROM_HOST_NAME} \\`,
      `  --target-ids ${shellQuote(settings.targetId)}`,
      'loginctl enable-linger "$USER"',
    ]),
    environment: joinLines([
      exportLine('MMT_API_URL', apiUrl),
      `export MMT_WORKER_ID=${WORKER_ID_FROM_HOST_NAME}`,
      exportLine('MMT_WORKER_TARGET_IDS', settings.targetId),
      ...promptedSecretLines('MMT_API_TOKEN', 'Worker API token'),
      `${WORKER_COMMAND} run`,
    ]),
  };
}
