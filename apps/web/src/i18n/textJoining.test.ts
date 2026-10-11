import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from './locale';
import { formatList, formatNote, joinLabels, joinSentences } from './textJoining';

afterEach(() => setLocale('ja'));

describe('joining text in the display language', () => {
  it('lists names with 「、」 in Japanese and as an English sentence lists them in English', () => {
    setLocale('ja');
    expect(formatList(['相田', '佐藤', '鈴木'])).toBe('相田、佐藤、鈴木');
    setLocale('en');
    expect(formatList(['Aida', 'Sato'])).toBe('Aida and Sato');
    expect(formatList(['Aida', 'Sato', 'Suzuki'])).toBe('Aida, Sato, and Suzuki');
    expect(formatList([])).toBe('');
  });

  it('returns a single name unchanged in either language and joins two Japanese names with 「、」', () => {
    setLocale('ja');
    expect(formatList(['相田'])).toBe('相田');
    expect(formatList(['相田', '佐藤'])).toBe('相田、佐藤');
    setLocale('en');
    expect(formatList(['Aida'])).toBe('Aida');
  });

  it('follows a language change after a list was already formatted in the other language', () => {
    setLocale('en');
    expect(formatList(['Aida', 'Sato', 'Suzuki'])).toBe('Aida, Sato, and Suzuki');
    setLocale('ja');
    expect(formatList(['相田', '佐藤', '鈴木'])).toBe('相田、佐藤、鈴木');
    setLocale('en');
    expect(formatList(['Aida', 'Sato'])).toBe('Aida and Sato');
  });

  it('puts short labels side by side with 「・」 in Japanese and a spaced dot in English', () => {
    setLocale('ja');
    expect(joinLabels(['学習', '評価'])).toBe('学習・評価');
    setLocale('en');
    expect(joinLabels(['Training', 'Evaluation'])).toBe('Training · Evaluation');
  });

  it('runs Japanese sentences together and separates English ones with one space', () => {
    setLocale('ja');
    expect(joinSentences(['保存しました。', '', '閉じてください。'])).toBe('保存しました。閉じてください。');
    setLocale('en');
    expect(joinSentences(['Saved.', '', 'Close this dialog.'])).toBe('Saved. Close this dialog.');
  });

  it('puts a note in full-width parentheses in Japanese and after a space in English', () => {
    setLocale('ja');
    expect(`GPU${formatNote('現在: 0')}`).toBe('GPU（現在: 0）');
    setLocale('en');
    expect(`GPU IDs${formatNote('current: 0')}`).toBe('GPU IDs (current: 0)');
  });
});
