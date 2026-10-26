// ドキュメントのスクリーンショットを撮るブラウザ。言語、テーマ、大きさと、撮る環境へのログイン。
import { pathToFileURL } from 'node:url';
import { LANGUAGES } from './screenshotEnvironment.mjs';

// pages/の画像の大きさ（CSSのpx、デバイスの倍率1）。
export const DOCS_VIEWPORT = { width: 1440, height: 900 };

export async function launchBrowser() {
  const modulePath = process.env.MMT_PLAYWRIGHT_MODULE;
  if (!modulePath) throw new Error('Set MMT_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
  const { chromium } = await import(pathToFileURL(modulePath).href);
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
    ...(process.env.MMT_CHROMIUM_PATH ? { executablePath: process.env.MMT_CHROMIUM_PATH } : {}),
  });
}

/**
 * スクリーンショットの言語に合わせたブラウザのcontext。ブラウザが伝えるlocaleをその言語にし、
 * UIの言語は言語メニューで選んだのと同じように保存しておく。テーマはいつもライト。
 */
export async function newDocsContext(browser, { lang, viewport = DOCS_VIEWPORT }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: LANGUAGES[lang].locale,
  });
  await context.addInitScript((locale) => {
    localStorage.setItem('mmt.theme', 'light');
    localStorage.setItem('mmt.locale', locale);
  }, lang);
  return context;
}

async function addSessionCookie(context, webUrl, signInPath, body) {
  const response = await fetch(`${webUrl}/api/auth/${signInPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: webUrl },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${signInPath}: HTTP ${response.status}`);
  const [name, value] = response.headers.get('set-cookie').split(';')[0].split('=');
  await context.addCookies([{ name, value, url: webUrl }]);
}

/** contextを開発用の全体管理者としてログインさせる（MMT_AUTH_MODE=development）。 */
export function signInForDevelopment(context, webUrl) {
  return addSessionCookie(context, webUrl, 'dev-login', {});
}

/** contextをローカルアカウントでログインさせる（MMT_AUTH_MODE=local）。 */
export function signInLocally(context, webUrl, { username, password }) {
  return addSessionCookie(context, webUrl, 'local-login', { username, password });
}
