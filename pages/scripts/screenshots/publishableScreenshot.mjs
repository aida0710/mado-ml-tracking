// ドキュメントのスクリーンショットを、公開しても安全なときだけ保存する。先にこのマシンの値（パス、
// ホスト名）を例の値に置き換え、私的なものがまだ画面に残っていれば画像を書かない。
import { mkdir } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import path from 'node:path';
import { LANGUAGES } from './screenshotEnvironment.mjs';

// スクリーンショットを撮る間にマウスを置く場所。上部バーの空いたところに置き、直前の操作による
// ホバーの見た目を出さない。
const NEUTRAL_MOUSE_OFFSET = { fromRight: 8, top: 60 };
const MOUSE_SETTLE_MS = 200;
// ドキュメントの例に出るworkerのホスト名。
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
 * 公開する画像に決して入れてはいけない文字列。ホームディレクトリ、ホスト名と、カンマ区切りの
 * MMT_DOCS_FORBIDDEN_TEXT（一時ディレクトリや実名など）。
 */
function forbiddenText() {
  const extra = (process.env.MMT_DOCS_FORBIDDEN_TEXT ?? '').split(',').map((value) => value.trim());
  return [homedir(), hostname(), ...extra].filter((value) => value && value !== '/');
}

async function replaceLocalValues(page, { replacements, maskTokens }) {
  // 長いローカルの値から置き換え、別のディレクトリの中にあるディレクトリにも専用の例を当てる。
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

// かなとCJKの漢字。英語の画面に残った日本語のUIや見本のデータの文字。
const JAPANESE_TEXT = /[\u3040-\u30ff\u3400-\u9fff\uff01-\uff60]/;

/** 英語のページにある日本語の行を並べる（サーバーのメッセージはわざと日本語のこともある）。 */
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
 * ローカルの値を置き換え、画面を確かめてから`<directory>/<name>.png`を保存する。
 * @param {object} options
 * @param {string} options.lang UIの言語。英語のページでは、残った日本語の文字を並べる
 * @param {[string, string][]} [options.replacements] ローカルの値 → 例の値
 * @param {boolean} [options.maskTokens] tokenの先頭を隠す（tokenの一覧）
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
