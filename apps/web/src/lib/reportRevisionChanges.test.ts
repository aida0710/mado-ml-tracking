import type { ReportBlock } from '@mmt/contracts';
import { describe, expect, it } from 'vitest';
import { hasRevisionChanges, reportRevisionChanges } from './reportRevisionChanges';

const text = (id: string, body: string): ReportBlock => ({ id, type: 'markdown', text: body });
const media = (id: string, steps?: number[]): ReportBlock => ({
  id,
  type: 'media',
  runIds: ['run-a', 'run-b'],
  key: 'eval/audio',
  ...(steps ? { steps } : {}),
  mode: 'live',
});

describe('前のバージョンとの違い', () => {
  it('同じidのブロックは、中身が変わると「変更」、無くなると「削除」、新しいidは「追加」になる', () => {
    const changes = reportRevisionChanges(
      { title: '比較', blocks: [text('a', '結果'), media('m', [19]), text('b', '次')] },
      { title: '比較', blocks: [text('a', '結果（修正）'), media('m', [19]), text('c', '追記'), media('n')] },
    );
    expect(changes).toEqual({
      isTitleChanged: false,
      added: [
        { type: 'markdown', count: 1 },
        { type: 'media', count: 1 },
      ],
      removed: [{ type: 'markdown', count: 1 }],
      edited: [{ type: 'markdown', count: 1 }],
      isReordered: false,
    });
  });

  it('残ったブロックの順番が変わると「並べ替え」になり、間に足しただけでは並べ替えにならない', () => {
    const before = { title: '比較', blocks: [text('a', '1'), text('b', '2')] };
    expect(reportRevisionChanges(before, { title: '比較', blocks: [text('b', '2'), text('a', '1')] }).isReordered).toBe(true);
    expect(
      reportRevisionChanges(before, { title: '比較', blocks: [text('a', '1'), media('m'), text('b', '2')] }).isReordered,
    ).toBe(false);
  });

  it('題名だけを変えたバージョンも変更ありになり、同じ内容なら変更なしになる', () => {
    const blocks = [text('a', '1')];
    const renamed = reportRevisionChanges({ title: '比較', blocks }, { title: '比較（確定）', blocks });
    expect(renamed.isTitleChanged).toBe(true);
    expect(hasRevisionChanges(renamed)).toBe(true);
    expect(hasRevisionChanges(reportRevisionChanges({ title: '比較', blocks }, { title: '比較', blocks }))).toBe(false);
  });
});
