import { madoTrackingInstallLines } from './madoTrackingPackage';
import { shellQuote } from './shellSnippet';

// ランチャー専用の環境。workerの環境（workerSetupSnippets.ts）とは別に置き、片方を更新しても
// もう片方に触れないようにする。
const LAUNCHER_VENV_DIRECTORY = '~/.local/share/mado-tracking-launcher/venv';
const LAUNCHER_COMMAND = `${LAUNCHER_VENV_DIRECTORY}/bin/mado-tracking-launcher`;
// 例でlauncher.tomlを置く場所。tokenのファイルと状態のディレクトリは、このファイルの中に書く。
export const EXAMPLE_LAUNCHER_CONFIG_PATH = '/etc/mado-tracking-launcher/launcher.toml';

/**
 * ランチャー（mado-trackingパッケージの`mado-tracking-launcher`コマンド。deploy/sites/README.md）を
 * インストールし、上に示したlauncher.tomlで起動するコマンド。
 */
export function buildLauncherStartCommands(): string {
  return [
    ...madoTrackingInstallLines({ venvDirectory: LAUNCHER_VENV_DIRECTORY }),
    `${LAUNCHER_COMMAND} --config ${shellQuote(EXAMPLE_LAUNCHER_CONFIG_PATH)}`,
  ].join('\n');
}
