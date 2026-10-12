import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from './locale';
import { formatList, formatNote, joinLabels, joinSentences } from './textJoining';

afterEach(() => setLocale('ja'));

describe('表示言語での文字列のつなぎ方', () => {
  it('名前の列挙は、日本語では「、」でつなぎ、英語では文中の列挙の書き方にする', () => {
    setLocale('ja');
    expect(formatList(['相田', '佐藤', '鈴木'])).toBe('相田、佐藤、鈴木');
    setLocale('en');
    expect(formatList(['Aida', 'Sato'])).toBe('Aida and Sato');
    expect(formatList(['Aida', 'Sato', 'Suzuki'])).toBe('Aida, Sato, and Suzuki');
    expect(formatList([])).toBe('');
  });

  it('名前が1つならどちらの言語でもそのまま返し、日本語の2つの名前は「、」でつなぐ', () => {
    setLocale('ja');
    expect(formatList(['相田'])).toBe('相田');
    expect(formatList(['相田', '佐藤'])).toBe('相田、佐藤');
    setLocale('en');
    expect(formatList(['Aida'])).toBe('Aida');
  });

  it('一方の言語で列挙したあとに言語を変えると、新しい言語の書き方で列挙する', () => {
    setLocale('en');
    expect(formatList(['Aida', 'Sato', 'Suzuki'])).toBe('Aida, Sato, and Suzuki');
    setLocale('ja');
    expect(formatList(['相田', '佐藤', '鈴木'])).toBe('相田、佐藤、鈴木');
    setLocale('en');
    expect(formatList(['Aida', 'Sato'])).toBe('Aida and Sato');
  });

  it('短いラベルは、日本語では「・」で、英語では前後に空白のある点で並べる', () => {
    setLocale('ja');
    expect(joinLabels(['学習', '評価'])).toBe('学習・評価');
    setLocale('en');
    expect(joinLabels(['Training', 'Evaluation'])).toBe('Training · Evaluation');
  });

  it('日本語の文は続けて書き、英語の文は空白1つで区切る', () => {
    setLocale('ja');
    expect(joinSentences(['保存しました。', '', '閉じてください。'])).toBe('保存しました。閉じてください。');
    setLocale('en');
    expect(joinSentences(['Saved.', '', 'Close this dialog.'])).toBe('Saved. Close this dialog.');
  });

  it('注記は、日本語では全角の括弧に入れ、英語では空白のあとの半角の括弧に入れる', () => {
    setLocale('ja');
    expect(`GPU${formatNote('現在: 0')}`).toBe('GPU（現在: 0）');
    setLocale('en');
    expect(`GPU IDs${formatNote('current: 0')}`).toBe('GPU IDs (current: 0)');
  });
});
