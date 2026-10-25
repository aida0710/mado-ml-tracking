import { text } from '../i18n/catalog';
import { launchersTextTemplates } from '../i18n/launchers';

// 例のパス。実際のパスはランチャーのホストが決める。
const EXAMPLE_TOKEN_FILE = '/run/secrets/mado-tracking-launcher/launcher.token';
const EXAMPLE_STATE_DIRECTORY = '/var/lib/mado-tracking-launcher';
const EXAMPLE_REGISTRY_SECRET_FILE = '/run/secrets/mado-tracking-launcher/registry.json';
// ランチャーが設定を読み、投入を引き受ける間隔。deploy/sitesと同じ。
const EXAMPLE_POLL_SECONDS = 10;
// コメントの行では置き換え、TOMLの文字列ではエスケープする。そのままだとファイルが壊れる。
// eslint-disable-next-line no-control-regex -- 制御文字に一致させるのがここの目的
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const UNICODE_ESCAPE_DIGITS = 4;
const HEXADECIMAL = 16;

/**
 * 新しいランチャーのlauncher.toml。ランチャーが起動に必要なものだけを持ち、site・鍵・job shellは
 * Webから受け取る。tokenはここには書かず、token_fileに書く。
 */
export function buildLauncherConfigExample({
  apiUrl,
  launcherName,
}: {
  apiUrl: string;
  launcherName: string;
}): string {
  const lines = [
    `# ${launchersTextTemplates.launcherConfigHeader(launcherName.replace(CONTROL_CHARACTERS, ' '))}`,
    `# ${text.launcherConfigApiUrlComment}`,
    `api_url = ${tomlString(apiUrl)}`,
    `# ${text.launcherConfigTokenFileComment}`,
    `token_file = ${tomlString(EXAMPLE_TOKEN_FILE)}`,
    `# ${text.launcherConfigStateComment}`,
    `state_directory = ${tomlString(EXAMPLE_STATE_DIRECTORY)}`,
    `# ${text.launcherConfigPollComment}`,
    `poll_seconds = ${EXAMPLE_POLL_SECONDS}`,
    `# ${text.launcherConfigRegistryComment}`,
    `# registry_secret_file = ${tomlString(EXAMPLE_REGISTRY_SECRET_FILE)}`,
  ];
  return `${lines.join('\n')}\n`;
}

// TOMLの基本文字列。バックスラッシュと引用符はエスケープし、制御文字は\uXXXXにする。
function tomlString(value: string): string {
  const escaped = value
    .replace(/[\\"]/g, (character) => `\\${character}`)
    .replace(
      CONTROL_CHARACTERS,
      (character) =>
        `\\u${character.charCodeAt(0).toString(HEXADECIMAL).padStart(UNICODE_ESCAPE_DIGITS, '0')}`,
    );
  return `"${escaped}"`;
}
