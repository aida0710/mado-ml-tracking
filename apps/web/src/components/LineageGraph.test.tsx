import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { LineageGraph } from '@mmt/contracts';
import { LineageGraphLayout } from './LineageGraph';
import { LineageRelationsTable } from './LineageRelationsTable';

const graph = {
  nodes: [
    { id: 'dataset', kind: 'datasetVersion', label: '評価用 v1' },
    { id: 'run', kind: 'run', label: '推論', status: 'finished' },
  ],
  edges: [{ source: 'dataset', target: 'run', relation: 'input' }],
} as unknown as LineageGraph;

describe('LineageGraphLayout', () => {
  const render = (isNarrow: boolean) =>
    renderToStaticMarkup(
      <LineageGraphLayout
        isNarrow={isNarrow}
        diagram={<div id="diagram" />}
        relations={<div id="relations" />}
      />,
    );

  it('puts the diagram first on a wide window', () => {
    const markup = render(false);
    expect(markup.indexOf('id="diagram"')).toBeLessThan(markup.indexOf('id="relations"'));
  });

  it('leads with the relations table on a narrow window', () => {
    const markup = render(true);
    expect(markup.indexOf('id="relations"')).toBeLessThan(markup.indexOf('id="diagram"'));
  });
});

describe('LineageRelationsTable', () => {
  const renderTable = (initiallyOpen: boolean) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <LineageRelationsTable graph={graph} projectId="project-1" initiallyOpen={initiallyOpen} />
      </MemoryRouter>,
    );

  it('opens the table when asked, as narrow windows do', () => {
    const markup = renderTable(true);
    expect(markup).toMatch(/<details[^>]* open=""/);
    expect(markup).toContain('評価用 v1');
    expect(markup).toContain('推論');
  });

  it('stays folded on wide windows', () => {
    expect(renderTable(false)).not.toMatch(/<details[^>]* open=""/);
  });

  it('関係の両端は種類を添えて、それぞれのページへのリンクになる', () => {
    const markup = renderTable(true);
    expect(markup).toContain('データセットバージョン');
    expect(markup).toContain('href="/projects/project-1/datasets?version=dataset"');
    expect(markup).toContain('href="/projects/project-1/runs/run"');
  });
});
