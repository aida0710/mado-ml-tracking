import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dialog, dialogClassName } from './Dialog';

describe('dialogClassName', () => {
  it('既定では狭い幅で全画面になる', () => {
    expect(dialogClassName({ wide: false, fullScreenOnNarrow: true, className: '' })).toBe(
      'dialog fullscreen-on-narrow',
    );
  });

  it('fullScreenOnNarrow を外すと狭い幅で下からのシートになり、wide と追加の class を保つ', () => {
    expect(
      dialogClassName({ wide: true, fullScreenOnNarrow: false, className: 'workspace-dialog' }),
    ).toBe('dialog wide sheet-on-narrow workspace-dialog');
  });
});

describe('Dialog', () => {
  it('見出しの［×］は送信ボタンではないので、フォームの中に置かれても保存しない', () => {
    const html = renderToStaticMarkup(
      createElement(Dialog, { title: '確認', onClose: () => {}, children: '本文' }),
    );
    expect(html).toMatch(/<header><h2 [^>]*>確認<\/h2><button type="button" class="icon-button"/);
  });
});
