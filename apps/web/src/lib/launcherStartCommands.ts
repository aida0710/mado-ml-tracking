import { madoTrackingInstallLines } from './madoTrackingPackage';
import { shellQuote } from './shellSnippet';

// The launcher's own environment, beside the worker's (workerSetupSnippets.ts), so updating one
// does not touch the other.
const LAUNCHER_VENV_DIRECTORY = '~/.local/share/mado-tracking-launcher/venv';
const LAUNCHER_COMMAND = `${LAUNCHER_VENV_DIRECTORY}/bin/mado-tracking-launcher`;
// Where the example puts launcher.toml; the token file and state directory are in the file itself.
export const EXAMPLE_LAUNCHER_CONFIG_PATH = '/etc/mado-tracking-launcher/launcher.toml';

/**
 * Commands that install the launcher (the `mado-tracking-launcher` command of the mado-tracking
 * package, deploy/sites/README.md) and start it with the launcher.toml shown above them.
 */
export function buildLauncherStartCommands(): string {
  return [
    ...madoTrackingInstallLines({ venvDirectory: LAUNCHER_VENV_DIRECTORY }),
    `${LAUNCHER_COMMAND} --config ${shellQuote(EXAMPLE_LAUNCHER_CONFIG_PATH)}`,
  ].join('\n');
}
