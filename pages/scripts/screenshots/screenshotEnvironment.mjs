// 言語ごとのドキュメントのスクリーンショットの置き場所と、スクリプトが起動してデータを入れる環境の
// 状態の置き場所。このディレクトリのすべてのスクリプトが使う。
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../..');

// locale: ブラウザが伝える言語（navigator.language）。UIは日付の表記にもこれを使う。
// imagesDirectory: pages/がその言語の画像を読み込む場所。
export const LANGUAGES = {
  ja: { locale: 'ja-JP', imagesDirectory: path.join(REPOSITORY_ROOT, 'pages/public/images') },
  en: { locale: 'en-US', imagesDirectory: path.join(REPOSITORY_ROOT, 'pages/public/images/en') },
};
const DEFAULT_LANGUAGE = 'ja';

// スクリーンショットに要る2つのサーバー。sample: 開発用のログインで、seed_sample_project.pyが
// データを入れた見本のProjectとクイックスタートのProjectを持つ。accounts: 複数のユーザーが
// いるローカルのログイン。
export const ENVIRONMENTS = {
  sample: { authMode: 'development', apiPort: 4682, webPort: 5682 },
  accounts: { authMode: 'local', apiPort: 4782, webPort: 5782 },
};

/**
 * `--lang <ja|en>`と`--name value`のオプションを読む。ほかの引数は順に返す。
 * @param {string[]} argv
 */
export function parseArguments(argv) {
  const options = { lang: DEFAULT_LANGUAGE };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      positional.push(argument);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${argument} needs a value`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  if (!Object.hasOwn(LANGUAGES, options.lang)) throw new Error(`--lang must be one of ${Object.keys(LANGUAGES).join(', ')}`);
  return { options, positional };
}

// var/はgitが無視する。MMT_DOCS_STATE_DIRで別の場所へ移せる。
export function stateRoot() {
  return process.env.MMT_DOCS_STATE_DIR ?? path.join(REPOSITORY_ROOT, 'var/docs-screenshots');
}

export function environmentDirectory(lang, environment) {
  if (!Object.hasOwn(ENVIRONMENTS, environment)) throw new Error(`unknown environment: ${environment}`);
  return path.join(stateRoot(), lang, environment);
}

/** serve-environment.mjsが環境を起動したときに書いたURL。 */
export async function readEnvironment(lang, environment) {
  const file = path.join(environmentDirectory(lang, environment), 'environment.json');
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT')
      throw new Error(`${environment} environment for ${lang} is not running: start it with serve-environment.mjs start ${environment} --lang ${lang}`);
    throw error;
  }
}

/** seedのスクリプトが環境のディレクトリに保存した状態（IDと使った名前）。 */
export async function readSeedState(lang, environment, fileName) {
  const file = path.join(environmentDirectory(lang, environment), fileName);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${file} is missing: run the seed script for ${environment} with --lang ${lang} first`);
    throw error;
  }
}
