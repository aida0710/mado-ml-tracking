import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownView } from './MarkdownView';

describe('Markdown の見出し', () => {
  it('画面の h1 の下に入るよう1段下げ、書いた段の見た目を data-markdown-level に残す', () => {
    const markup = renderToStaticMarkup(<MarkdownView source={'# 概要\n\n## 結果\n\n###### 注'} />);
    expect(markup).toContain('<h2 data-markdown-level="1">概要</h2>');
    expect(markup).toContain('<h3 data-markdown-level="2">結果</h3>');
    expect(markup).toContain('<h6 data-markdown-level="6">注</h6>');
    expect(markup).not.toContain('<h1');
  });
});
