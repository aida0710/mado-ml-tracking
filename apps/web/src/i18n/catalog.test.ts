import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from './locale';
import { text, textTemplates } from './catalog';
import { computeTextTemplates } from './compute';
import { projectAccessTextTemplates } from './projectAccess';
import { localizeMessage } from './messageTranslations';
import { formatDate, formatCompactNumber } from '../lib/format';
import { formatRelativeTime } from '../lib/relativeTime';

const japaneseDomains = import.meta.glob(['./*.ts', '!./*.test.ts'], { eager: true });
const englishDomains = import.meta.glob('./en/*.ts', { eager: true });
afterEach(() => setLocale('ja'));

// Japanese letters, and the Japanese punctuation and brackets an English sentence never needs.
const JAPANESE_TEXT = /[ぁ-んァ-ン一-龯、。・「」（）［］：]/;

/** Each string of a catalog entry with where it is, including the labels of nested objects. */
function listStrings(value: unknown, path: string): Array<{ path: string; message: string }> {
  if (typeof value === 'string') return [{ path, message: value }];
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => listStrings(child, `${path}.${key}`));
}

/** The key paths inside a nested entry such as { recording: { label, hint } }. */
function listKeyPaths(value: unknown, path = ''): string[] {
  if (typeof value !== 'object' || value === null) return [path];
  return Object.entries(value).flatMap(([key, child]) => listKeyPaths(child, `${path}.${key}`)).sort();
}

describe('英語と日本語の辞書', () => {
  it('英語の辞書は日本語の辞書と同じexport・キー・形を持ち、日本語の文字を含まない', () => {
    for (const [path, englishModule] of Object.entries(englishDomains)) {
      const japaneseModule = japaneseDomains[path.replace('/en/', '/')] as Record<string, Record<string, unknown>>;
      expect(japaneseModule, path).toBeDefined();
      expect(Object.keys(englishModule as object).sort(), path).toEqual(Object.keys(japaneseModule).sort());
      for (const [name, englishCatalog] of Object.entries(englishModule as Record<string, Record<string, unknown>>)) {
        const japaneseCatalog = japaneseModule[name];
        if (!japaneseCatalog) throw new Error(`Missing Japanese export: ${path}:${name}`);
        expect(Object.keys(englishCatalog).sort(), `${path}:${name}`).toEqual(Object.keys(japaneseCatalog).sort());
        for (const [key, message] of Object.entries(englishCatalog)) {
          setLocale('ja');
          const japaneseMessage = japaneseCatalog[key];
          setLocale('en');
          expect(typeof japaneseMessage, `${path}:${key}`).toBe(typeof message);
          expect(listKeyPaths(message), `${path}:${key}`).toEqual(listKeyPaths(japaneseMessage));
          for (const english of listStrings(message, `${path}:${name}.${key}`)) {
            expect(english.message, english.path).not.toMatch(JAPANESE_TEXT);
          }
          if (typeof message === 'string') expect(japaneseCatalog[key], `${path}:${key}`).toBe(message);
        }
      }
    }
  });

  it('切り替える前に読み込んだ、まとめた辞書とテンプレートも切り替えた言語で返す', () => {
    setLocale('ja');
    expect(text.name).toBe('名前');
    setLocale('en');
    expect(text.name).toBe('Name');
    expect(textTemplates.revokeTokenConfirm('日本語のトークン')).toContain('日本語のトークン');
    expect(textTemplates.revokeTokenConfirm('sample')).not.toMatch(/[ぁ-んァ-ン一-龯]/);
  });

  it('保持したアプリのエラー文は切り替えた言語で出し、知らないサーバーの文はそのまま残す', () => {
    setLocale('ja');
    const captured = text.unexpectedError;
    setLocale('en');
    expect(localizeMessage(captured)).toBe(text.unexpectedError);
    expect(localizeMessage('custom service detail')).toBe('custom service detail');
  });

  it('英語で1件のときは単数の名詞と、それに合う動詞にする', () => {
    setLocale('en');
    expect(textTemplates.uploadSelectedCount(1, '512 B')).toBe('1 file (512 B)');
    expect(textTemplates.uploadSelectedCount(2, '1 KB')).toBe('2 files (1 KB)');
    expect(textTemplates.chartLogExcluded(1)).toBe('1 non-positive point is omitted from the logarithmic axis.');
    expect(textTemplates.datasetFolderUnfinished(1, 1)).toContain('1 file has not been uploaded');
    expect(textTemplates.datasetFolderUnfinished(1, 1)).toContain('without it. Even after closing, the 1 stored file stays');
    expect(textTemplates.datasetFolderUnfinished(2, 0)).toContain('Retry uploading them');
    expect(textTemplates.analysisRunCount(1, 1)).toBe('Calculated from 1 run (excluding 1 run without objective values)');
    expect(computeTextTemplates.queueTimeoutError(1, 30)).toBe('Specify a queue timeout between 1 minute and 30 days in HH:MM:SS format.');
    expect(projectAccessTextTemplates.removeMemberConfirm({ displayName: '試験（A）、B〜C', keepsGroupRole: true, isSelf: false })).toContain('“試験（A）、B〜C”? Roles');
  });

  it('日付・大きな数・経過時間を選んだ言語の書き方にする', () => {
    const now = Date.parse('2026-10-11T03:00:00Z');
    const value = '2026-10-11T02:58:00Z';
    setLocale('ja');
    const japaneseDate = formatDate(value);
    expect(formatRelativeTime(value, now)).toBe('2分前');
    expect(formatCompactNumber(10000)).toBe('1万');
    setLocale('en');
    expect(formatDate(value)).not.toBe(japaneseDate);
    expect(formatRelativeTime(value, now)).toBe('2 minutes ago');
    expect(formatCompactNumber(10000)).toBe('10K');
  });
});
