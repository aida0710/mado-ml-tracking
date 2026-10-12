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

describe('language preference', () => {
  it('a saved choice overrides the browser language', () => {
    browserPreference({ languages: ['en-US'], stored: 'ja' });
    expect(initialLocale()).toBe('ja');
  });

  it('uses the first supported language when no valid choice is saved', () => {
    browserPreference({ languages: ['fr-FR', 'ja-JP', 'en-US'], stored: 'invalid' });
    expect(initialLocale()).toBe('ja');
    browserPreference({ languages: ['en-GB', 'ja-JP'], stored: null });
    expect(initialLocale()).toBe('en');
  });

  it('falls back to English for unsupported languages', () => {
    browserPreference({ languages: ['fr-FR'], stored: null });
    expect(initialLocale()).toBe('en');
  });

  it('falls back to English when the browser reports no language', () => {
    vi.stubGlobal('navigator', { languages: [], language: undefined });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    expect(initialLocale()).toBe('en');
    vi.stubGlobal('navigator', undefined);
    expect(initialLocale()).toBe('en');
  });

  it('uses navigator.language when the language list is empty', () => {
    vi.stubGlobal('navigator', { languages: [], language: 'ja-JP' });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    expect(initialLocale()).toBe('ja');
  });

  it('still switches language when browser storage is unavailable', () => {
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
