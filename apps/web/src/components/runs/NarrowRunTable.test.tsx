import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { Run, SavedViewColumn } from '@mmt/contracts';
import { NarrowRunTable } from './NarrowRunTable';
import type { RunListSelection } from './RunTableCells';
import { text } from '../../i18n/catalog';

const run = (id: string, name: string, metric: number): Run => ({
  id,
  projectId: 'p1',
  experimentId: 'e1',
  name,
  kind: 'training',
  status: 'finished',
  parameters: { lr: 0.001 },
  tags: {},
  latestMetrics: { accuracy: metric },
  modelVersionId: null,
  codeVersionId: null,
  inputDatasetVersionIds: [],
  upstreamDatasetVersionIds: [],
  outputDatasetVersionIds: [],
  outputModelVersionIds: [],
  parentRunId: null,
  environment: {},
  createdBy: 'user-1',
  createdAt: '2026-10-08T00:00:00Z',
  startedAt: '2026-10-08T00:00:00Z',
  endedAt: '2026-10-08T01:00:00Z',
  error: null,
});
const runs = [run('r1', 'training-01', 0.81), run('r2', 'training-02', 0.92)];
const columns: SavedViewColumn[] = [{ key: 'status' }, { key: 'created' }, { key: 'metrics.accuracy', width: 140 }];
const selectionOf = (selectedIds: string[]): RunListSelection => ({
  isSelected: (runId) => selectedIds.includes(runId),
  areAllShownSelected: runs.every((item) => selectedIds.includes(item.id)),
  toggle: () => undefined,
  setAllShown: () => undefined,
});

const render = (shownColumns: SavedViewColumn[], selectedIds: string[] = []) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <NarrowRunTable projectId="p1" runs={runs} columns={shownColumns} selection={selectionOf(selectedIds)} />
    </MemoryRouter>,
  );
const headerCount = (markup: string) => (markup.match(/<th[\s>]/g) ?? []).length;

describe('狭い幅の Run 一覧', () => {
  it('選択・Run名・状態だけを行に出し、残りの列は行を開くボタンの奥に置く', () => {
    const markup = render(columns);
    // 見出しは「すべて選択」「Run名」「状態」と、行を開くボタンの列。
    expect(headerCount(markup)).toBe(4);
    expect(markup).toContain(text.selectAll);
    expect(markup).toContain(text.runName);
    expect(markup).toContain(text.status);
    expect(markup).not.toContain(text.created);
    expect(markup).not.toContain('0.81');
    expect(markup.match(/aria-expanded="false"/g)).toHaveLength(runs.length);
    expect(markup).toContain('href="/projects/p1/runs/r1"');
  });

  it('選んだ Run の行には選択中の印とチェックを付ける', () => {
    const markup = render(columns, ['r2']);
    expect(markup.match(/<tr class="selected">/g)).toHaveLength(1);
    expect(markup.indexOf('class="selected"')).toBeGreaterThan(markup.indexOf('training-01'));
    expect(markup).toContain(`aria-label="${text.selectRun}: training-02" checked=""`);
  });

  it('状態を表示しない保存ビューでも、選択と Run名は行に残る', () => {
    const markup = render([{ key: 'created' }]);
    expect(headerCount(markup)).toBe(3);
    expect(markup).toContain(text.runName);
    expect(markup).not.toContain(text.created);
  });
});
