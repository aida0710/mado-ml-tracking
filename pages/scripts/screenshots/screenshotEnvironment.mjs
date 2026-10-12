// Where the documentation screenshots of each language go, and where the environments that the
// scripts start and seed keep their state. Shared by every script in this directory.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../..');

// locale: what the browser reports (navigator.language), which the UI also uses for dates.
// imagesDirectory: where pages/ reads the images of that language from.
export const LANGUAGES = {
  ja: { locale: 'ja-JP', imagesDirectory: path.join(REPOSITORY_ROOT, 'pages/public/images') },
  en: { locale: 'en-US', imagesDirectory: path.join(REPOSITORY_ROOT, 'pages/public/images/en') },
};
const DEFAULT_LANGUAGE = 'ja';

// The two servers the screenshots need. sample: development login, the sample Project seeded by
// seed_sample_project.py and the quickstart Project. accounts: local login with several users.
export const ENVIRONMENTS = {
  sample: { authMode: 'development', apiPort: 4682, webPort: 5682 },
  accounts: { authMode: 'local', apiPort: 4782, webPort: 5782 },
};

/**
 * Reads `--lang <ja|en>` and `--name value` options; other arguments are returned in order.
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

// var/ is ignored by git; MMT_DOCS_STATE_DIR moves it elsewhere.
export function stateRoot() {
  return process.env.MMT_DOCS_STATE_DIR ?? path.join(REPOSITORY_ROOT, 'var/docs-screenshots');
}

export function environmentDirectory(lang, environment) {
  if (!Object.hasOwn(ENVIRONMENTS, environment)) throw new Error(`unknown environment: ${environment}`);
  return path.join(stateRoot(), lang, environment);
}

/** The URLs serve-environment.mjs wrote when it started the environment. */
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

/** The state a seed script saved (IDs and the names it used) in the environment directory. */
export async function readSeedState(lang, environment, fileName) {
  const file = path.join(environmentDirectory(lang, environment), fileName);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${file} is missing: run the seed script for ${environment} with --lang ${lang} first`);
    throw error;
  }
}
