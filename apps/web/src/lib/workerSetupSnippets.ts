import { clientApiUrl } from './clientApiUrl';
import { madoTrackingInstallLines } from './madoTrackingPackage';
import { exportLine, joinLines, promptedSecretLines, shellQuote } from './shellSnippet';

// pages/compute/worker.md: the worker's own virtual environment, which `upgrade` reinstalls into,
// with telemetry for the GPU and memory metrics of each Job.
const WORKER_VENV_DIRECTORY = '~/.local/share/mado-tracking-worker/venv';
const WORKER_COMMAND = `${WORKER_VENV_DIRECTORY}/bin/mado-tracking-worker`;
const WORKER_INSTALL_EXTRAS = ['telemetry'];
// The worker ID must stay the same across restarts and upgrades. The worker machine's short host
// name does, is usually made of the allowed characters (letters, digits, . _ -), and is filled in
// by the shell, so the commands run as they are copied.
const WORKER_ID_FROM_HOST_NAME = '"$(hostname -s)"';

/** How a worker that takes this computer's Jobs is installed, as commands with its ID filled in. */
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
    // `install` asks for the token itself and writes it into a file only the user can read.
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
