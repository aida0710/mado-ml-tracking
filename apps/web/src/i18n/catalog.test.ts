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

describe('English and Japanese catalogs', () => {
  it('covers the same domain exports and message keys in English', () => {
    for (const [path, englishModule] of Object.entries(englishDomains)) {
      const japaneseModule = japaneseDomains[path.replace('/en/', '/')] as Record<string, Record<string, unknown>>;
      expect(japaneseModule, path).toBeDefined();
      expect(Object.keys(englishModule as object).sort(), path).toEqual(Object.keys(japaneseModule).sort());
      for (const [name, englishCatalog] of Object.entries(englishModule as Record<string, Record<string, unknown>>)) {
        const japaneseCatalog = japaneseModule[name];
        if (!japaneseCatalog) throw new Error(`Missing Japanese export: ${path}:${name}`);
        expect(Object.keys(englishCatalog).sort(), `${path}:${name}`).toEqual(Object.keys(japaneseCatalog).sort());
        setLocale('en');
        for (const [key, message] of Object.entries(englishCatalog)) {
          expect(typeof japaneseCatalog[key], `${path}:${key}`).toBe(typeof message);
          if (typeof message === 'string') {
            expect(message, `${path}:${key}`).not.toMatch(/[ぁ-んァ-ン一-龯]/);
            expect(japaneseCatalog[key], `${path}:${key}`).toBe(message);
          }
        }
      }
    }
  });

  it('updates merged catalogs and templates that were imported before switching', () => {
    setLocale('ja');
    expect(text.name).toBe('名前');
    setLocale('en');
    expect(text.name).toBe('Name');
    expect(textTemplates.revokeTokenConfirm('日本語のトークン')).toContain('日本語のトークン');
    expect(textTemplates.revokeTokenConfirm('sample')).not.toMatch(/[ぁ-んァ-ン一-龯]/);
  });

  it('updates a captured application error and retains unknown server text', () => {
    setLocale('ja');
    const captured = text.unexpectedError;
    setLocale('en');
    expect(localizeMessage(captured)).toBe(text.unexpectedError);
    expect(localizeMessage('custom service detail')).toBe('custom service detail');
  });

  it('uses singular nouns and matching verbs when one item remains', () => {
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

  it('formats dates, large values and elapsed time in the selected language', () => {
    const now = Date.parse('2026-10-11T03:00:00Z');
    const value = '2026-10-11T02:58:00Z';
    setLocale('ja');
    const japaneseDate = formatDate(value);
    expect(formatRelativeTime(value, now)).toBe('2 分前');
    expect(formatCompactNumber(10000)).toBe('1万');
    setLocale('en');
    expect(formatDate(value)).not.toBe(japaneseDate);
    expect(formatRelativeTime(value, now)).toBe('2 minutes ago');
    expect(formatCompactNumber(10000)).toBe('10K');
  });
});
