import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLocale, initialLocale, initializeLocale, setLocale } from './locale';

function browserPreference({ languages, stored }: { languages: string[]; stored: string | null }) {
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { languages });
  vi.stubGlobal('localStorage', { getItem: () => stored, setItem: vi.fn() });
}

afterEach(() => {
  vi.unstubAllGlobals();
  setLocale('ja');
});

describe('表示言語の選択', () => {
  it('保存した選択をブラウザの言語より優先する', () => {
    browserPreference({ languages: ['en-US'], stored: 'ja' });
    expect(initialLocale()).toBe('ja');
  });

  it('有効な選択が保存されていなければ、ブラウザの言語のうち対応している最初のものにする', () => {
    browserPreference({ languages: ['fr-FR', 'ja-JP', 'en-US'], stored: 'invalid' });
    expect(initialLocale()).toBe('ja');
    browserPreference({ languages: ['en-GB', 'ja-JP'], stored: null });
    expect(initialLocale()).toBe('en');
  });

  it('ブラウザの言語に対応しているものが無ければ英語にする', () => {
    browserPreference({ languages: ['fr-FR'], stored: null });
    expect(initialLocale()).toBe('en');
  });

  it('ブラウザが言語を返さないときは英語にする', () => {
    vi.stubGlobal('navigator', { languages: [], language: undefined });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    expect(initialLocale()).toBe('en');
    vi.stubGlobal('navigator', undefined);
    expect(initialLocale()).toBe('en');
  });

  it('言語の一覧が空ならnavigator.languageを使う', () => {
    vi.stubGlobal('navigator', { languages: [], language: 'ja-JP' });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    expect(initialLocale()).toBe('ja');
  });

  it('ブラウザの保存領域が使えなくても言語を切り替えられる', () => {
    browserPreference({ languages: ['en-US'], stored: null });
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Unavailable'); },
      setItem: () => { throw new Error('Unavailable'); },
    });
    vi.stubGlobal('document', { documentElement: { lang: '' } });
    expect(initialLocale()).toBe('en');
    setLocale('en');
    initializeLocale();
    expect(getLocale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
