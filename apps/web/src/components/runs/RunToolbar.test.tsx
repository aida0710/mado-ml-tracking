import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RunKind } from '@mmt/contracts';
import { RunToolbar } from './RunToolbar';

const noop = () => {};

function renderToolbar(
  kinds: RunKind[],
  search: { searchText?: string; filterRejection?: string | null } = {},
) {
  return renderToStaticMarkup(
    <RunToolbar
      searchText={search.searchText ?? ''}
      filterRejection={search.filterRejection ?? null}
      status=""
      kinds={kinds}
      sort="newest"
      metricNames={[]}
      columnNames={[]}
      isColumnVisible={() => false}
      onSearch={noop}
      onStatusChange={noop}
      onKindsChange={noop}
      onSortChange={noop}
      onColumnToggle={noop}
      exportingCsv={false}
      onExportCsv={noop}
    />,
  );
}

describe('Run一覧の実行種別の絞り込み', () => {
  it('保存ビューの実行種別を選択した状態で表示する', () => {
    expect(renderToolbar(['training'])).toMatch(/<option value="training" selected="">/);
  });

  it('APIで保存した複数の種別は1つの選択肢として残し、ほかの種別も選べる', () => {
    const html = renderToolbar(['inference', 'evaluation']);
    expect(html).toMatch(/<option value="inference,evaluation" selected="">[^<]*<\/option>/);
    expect(html).toContain('<option value="training">');
  });
});

describe('検索式の失敗の案内', () => {
  it('APIが断った検索式の理由を、再試行のボタンなしで検索欄の下に出す', () => {
    const html = renderToolbar([], {
      searchText: 'params.learning_rate > 0.1',
      filterRejection: 'params.learning_rateは文字列として比べるので…',
    });
    expect(html).toContain('params.learning_rateは文字列として比べるので…');
    expect(html).toContain('aria-invalid="true"');
    expect(html).not.toContain('再試行');
  });

  it('metrics. を付け忘れた比較を名前で探したときは、直した式を示す', () => {
    const html = renderToolbar([], { searchText: 'loss < 0.2' });
    expect(html).toContain('metrics.loss &lt; 0.2');
    expect(html).toContain('この式で検索');
  });
});
