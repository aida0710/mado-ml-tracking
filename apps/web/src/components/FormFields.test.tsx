import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormFields } from './FormFields';
import { text } from '../i18n/catalog';

const datasetOptions = Array.from({ length: 10 }, (_, index) => ({
  value: `dataset-v${index + 1}`,
  label: `speech/jsut / v${index + 1}`,
}));

function render(options: { value: string; label: string }[], selected: string[]) {
  return renderToStaticMarkup(
    <FormFields
      fields={[
        { name: 'datasets', label: '入力データセットバージョン', type: 'checkboxes', options, emptyText: 'なし' },
      ]}
      values={{ datasets: selected }}
      onChange={() => undefined}
    />,
  );
}

describe('複数選択の欄（checkboxes）', () => {
  it('ブラウザ標準の複数選択リストではなく、選んだものにチェックが付いたチェックボックスの一覧にする', () => {
    const html = render(datasetOptions.slice(0, 3), ['dataset-v2']);
    expect(html).not.toContain('<select');
    expect(html).toContain('<legend>入力データセットバージョン</legend>');
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html.match(/checked=""/g)).toHaveLength(1);
  });

  it('選択肢が多いときだけ絞り込みの欄を出す', () => {
    expect(render(datasetOptions.slice(0, 3), [])).not.toContain(`aria-label="${text.filter}"`);
    expect(render(datasetOptions, [])).toContain(`aria-label="${text.filter}"`);
  });

  it('選択肢が無いときは、空の一覧の代わりに理由を出す', () => {
    expect(render([], [])).toContain('なし');
  });
});
