import { afterEach, describe, expect, it, vi } from 'vitest';

// このアプリの表示言語のストアを、ブラウザの状態を差し替えて作り直す（locale.tsは読み込んだときに作る）。
async function loadLocaleStore({ languages, language, stored }: {
  languages: string[];
  language?: string;
  stored: string | null;
}) {
  vi.resetModules();
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('navigator', { languages, language });
  vi.stubGlobal('localStorage', { getItem: () => stored, setItem: vi.fn() });
  const { localeStore } = await import('./locale');
  return localeStore;
}

afterEach(() => vi.unstubAllGlobals());

describe('表示言語の選択', () => {
  it('保存した選択をブラウザの言語より優先する', async () => {
    const store = await loadLocaleStore({ languages: ['en-US'], stored: 'ja' });
    expect(store.getLocale()).toBe('ja');
  });

  it('有効な選択が保存されていなければ、ブラウザの言語のうち対応している最初のものにする', async () => {
    expect((await loadLocaleStore({ languages: ['fr-FR', 'ja-JP', 'en-US'], stored: 'invalid' })).getLocale()).toBe('ja');
    expect((await loadLocaleStore({ languages: ['en-GB', 'ja-JP'], stored: null })).getLocale()).toBe('en');
  });

  it('ブラウザの言語に対応しているものが無いか、言語を返さないときは英語にする', async () => {
    expect((await loadLocaleStore({ languages: ['fr-FR'], stored: null })).getLocale()).toBe('en');
    expect((await loadLocaleStore({ languages: [], stored: null })).getLocale()).toBe('en');
  });

  it('言語の一覧が空ならnavigator.languageを使う', async () => {
    const store = await loadLocaleStore({ languages: [], language: 'ja-JP', stored: null });
    expect(store.getLocale()).toBe('ja');
  });

  it('選んだ言語はこのアプリの保存キーに書き、<html lang>にも書く', async () => {
    const setItem = vi.fn();
    const store = await loadLocaleStore({ languages: ['ja-JP'], stored: null });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem });
    vi.stubGlobal('document', { documentElement: { lang: '' } });
    store.setLocale('en');
    expect(setItem).toHaveBeenCalledWith('mmt.locale', 'en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('ブラウザの保存領域が使えなくても言語を切り替えられる', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('navigator', { languages: ['en-US'] });
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Unavailable'); },
      setItem: () => { throw new Error('Unavailable'); },
    });
    vi.stubGlobal('document', { documentElement: { lang: '' } });
    const { localeStore } = await import('./locale');
    expect(localeStore.getLocale()).toBe('en');
    localeStore.setLocale('ja');
    expect(localeStore.getLocale()).toBe('ja');
    expect(document.documentElement.lang).toBe('ja');
  });
});
