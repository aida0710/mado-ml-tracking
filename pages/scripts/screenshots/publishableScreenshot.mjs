// Saves a documentation screenshot only when it is safe to publish: values of this machine (paths,
// host name) are replaced with example values first, and the image is not written when anything
// private is still on the screen.
import { mkdir } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import path from 'node:path';
import { LANGUAGES } from './screenshotEnvironment.mjs';

// Where the mouse rests while a screenshot is taken: an empty spot of the top bar, so no hover
// style from the previous action shows.
const NEUTRAL_MOUSE_OFFSET = { fromRight: 8, top: 60 };
const MOUSE_SETTLE_MS = 200;
// The host name of a worker in the docs' examples.
const EXAMPLE_WORKER_HOST = 'worker-1.example.internal';
const PRIVATE_ADDRESS = /\b(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)\b/;
// token の一覧に出る先頭（mado_mt_AbC1… や mado_mtj_…）。
const TOKEN_PREFIX = /mado_mtj?_[A-Za-z0-9_-]{4,}/g;
const MASKED_TOKEN_PREFIX = 'mado_mt_••••••••';

export async function outputDirectory(lang) {
  const directory = process.env.MMT_DOCS_OUTPUT_DIR ?? LANGUAGES[lang].imagesDirectory;
  await mkdir(directory, { recursive: true });
  return directory;
}

/**
 * Text that must never be in a published image: the home directory, the host name, and the
 * comma-separated MMT_DOCS_FORBIDDEN_TEXT (for example a temporary directory or a real name).
 */
function forbiddenText() {
  const extra = (process.env.MMT_DOCS_FORBIDDEN_TEXT ?? '').split(',').map((value) => value.trim());
  return [homedir(), hostname(), ...extra].filter((value) => value && value !== '/');
}

async function replaceLocalValues(page, { replacements, maskTokens }) {
  // Longer local values first, so a directory inside another one gets its own example.
  const pairs = [...replacements, [hostname(), EXAMPLE_WORKER_HOST]]
    .filter(([local]) => local)
    .sort(([left], [right]) => right.length - left.length);
  await page.evaluate(
    ({ pairs, maskTokens, tokenPattern, maskedToken }) => {
      const replace = (value) => {
        let replaced = value;
        for (const [local, example] of pairs) replaced = replaced.split(local).join(example);
        return maskTokens ? replaced.replace(new RegExp(tokenPattern, 'g'), maskedToken) : replaced;
      };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const replaced = replace(node.nodeValue);
        if (replaced !== node.nodeValue) node.nodeValue = replaced;
      }
      for (const field of document.querySelectorAll('input, textarea')) {
        const replaced = replace(field.value);
        if (replaced !== field.value) field.value = replaced;
      }
    },
    { pairs, maskTokens, tokenPattern: TOKEN_PREFIX.source, maskedToken: MASKED_TOKEN_PREFIX },
  );
}

// Kana and CJK ideographs: text of the Japanese UI or sample data on an English screen.
const JAPANESE_TEXT = /[\u3040-\u30ff\u3400-\u9fff\uff01-\uff60]/;

/** Lists Japanese lines of an English page (server messages may stay Japanese on purpose). */
async function reportJapaneseText(page, name) {
  const lines = (await page.evaluate(() => document.body.innerText)).split('\n');
  for (const line of lines) if (JAPANESE_TEXT.test(line)) console.log(`japanese text in ${name}: ${line.trim().slice(0, 120)}`);
}

async function assertPublishable(page) {
  const shown = await page.evaluate(
    () => `${document.body.innerText}\n${[...document.querySelectorAll('input, textarea')].map((field) => field.value).join('\n')}`,
  );
  for (const text of forbiddenText()) if (shown.includes(text)) throw new Error(`private text remains on the screen: ${text}`);
  const address = shown.match(PRIVATE_ADDRESS);
  if (address) throw new Error(`private address remains on the screen: ${address[0]}`);
}

/**
 * Replaces local values, checks the screen and saves `<directory>/<name>.png`.
 * @param {object} options
 * @param {string} options.lang the UI language; English pages list any Japanese text left
 * @param {[string, string][]} [options.replacements] local value → example value
 * @param {boolean} [options.maskTokens] hide token prefixes (token lists)
 */
export async function saveScreenshot(page, directory, name, { lang, replacements = [], maskTokens = false }) {
  const viewport = page.viewportSize();
  await page.mouse.move(viewport.width - NEUTRAL_MOUSE_OFFSET.fromRight, NEUTRAL_MOUSE_OFFSET.top);
  await page.waitForTimeout(MOUSE_SETTLE_MS);
  await replaceLocalValues(page, { replacements, maskTokens });
  await assertPublishable(page);
  if (lang === 'en') await reportJapaneseText(page, name);
  await page.screenshot({ path: path.join(directory, `${name}.png`) });
  console.log('captured', name);
}
