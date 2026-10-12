// The browser the documentation screenshots are taken in: its language, theme and size, and the
// sign-in to the environment being photographed.
import { pathToFileURL } from 'node:url';
import { LANGUAGES } from './screenshotEnvironment.mjs';

// The size the images in pages/ have (CSS px, device scale 1).
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
 * A browser context in the language of the screenshots: the browser reports the locale, and the
 * UI language is stored as if chosen in the language menu. The theme is always light.
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

/** Signs the context in as the development administrator (AUTH_MODE=development). */
export function signInForDevelopment(context, webUrl) {
  return addSessionCookie(context, webUrl, 'dev-login', {});
}

/** Signs the context in with a local account (AUTH_MODE=local). */
export function signInLocally(context, webUrl, { username, password }) {
  return addSessionCookie(context, webUrl, 'local-login', { username, password });
}
