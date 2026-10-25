import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('閉じるボタンは表示言語の名前を持ち、送信ボタンではないのでフォームの中に置かれても保存しない', () => {
    const html = renderToStaticMarkup(createElement(Dialog, { title: '確認', onClose: () => {}, children: '本文' }));
    expect(html).toMatch(/<h2 [^>]*>確認<\/h2>/);
    expect(html).toMatch(/<button type="button" class="icon-button" aria-label="閉じる"/);
  });
});
