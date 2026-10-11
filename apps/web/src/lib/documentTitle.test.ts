import { describe, expect, it } from 'vitest';
import { composeDocumentTitle, PRODUCT_NAME } from './documentTitle';

describe('ブラウザのタブのタイトル', () => {
  it('画面の名前、文脈、製品名の順に並べる', () => {
    expect(composeDocumentTitle(['Runs', '音声モデル実験'])).toBe(`Runs · 音声モデル実験 · ${PRODUCT_NAME}`);
  });

  it('空の部分は飛ばし、何も無ければ製品名だけにする', () => {
    expect(composeDocumentTitle(['Models', undefined, ' '])).toBe(`Models · ${PRODUCT_NAME}`);
    expect(composeDocumentTitle([])).toBe(PRODUCT_NAME);
  });

  it('見出しの改行や連続する空白は1つの空白にする', () => {
    expect(composeDocumentTitle(['Experiments\n / Runs'])).toBe(`Experiments / Runs · ${PRODUCT_NAME}`);
  });
});
