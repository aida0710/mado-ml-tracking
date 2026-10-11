import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { Artifact } from '@mmt/contracts';
import { ArtifactOwnerCell } from './ArtifactOwnerCell';
import { text } from '../i18n/catalog';

const artifact = (overrides: Partial<Artifact>): Artifact => ({
  id: 'a1',
  projectId: 'p1',
  runId: null,
  path: 'exports/model.onnx',
  mimeType: 'application/octet-stream',
  size: 10,
  sha256: '0'.repeat(64),
  createdAt: '2026-10-11T00:00:00Z',
  ...overrides,
} as Artifact);

function render(props: Partial<Parameters<typeof ArtifactOwnerCell>[0]>) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ArtifactOwnerCell
        artifact={artifact({})}
        runName={undefined}
        references={undefined}
        areReferencesChecked
        datasets={new Map()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('Artifacts一覧の所属の欄', () => {
  it('使われている場所を読み込んでいる間は「Runなし」と言わず、読み込み中と出す', () => {
    const markup = render({ areReferencesChecked: false });
    expect(markup).toContain(text.loading);
    expect(markup).not.toContain(text.artifactNoRun);
  });

  it('読み込んで何からも使われていなければ「Runなし」と出す', () => {
    expect(render({})).toContain(text.artifactNoRun);
  });

  it('RunのファイルはRun名、名前が無ければIDの先頭でRunへリンクする', () => {
    const markup = render({
      artifact: artifact({ runId: '0f1e2d3c-4b5a-4968-8776-655443322110' }),
      areReferencesChecked: false,
    });
    expect(markup).toContain('>0f1e2d3c</a>');
    expect(markup).toContain('/runs/0f1e2d3c-4b5a-4968-8776-655443322110?tab=artifacts');
  });
});
