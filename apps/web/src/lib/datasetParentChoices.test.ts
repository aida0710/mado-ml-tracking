import { describe, expect, it } from 'vitest';
import type { DatasetVersion } from '@mmt/contracts';
import { datasetParentChoices } from './datasetParentChoices';

const version = (id: string, datasetId: string, createdAt: string): DatasetVersion =>
  ({ id, datasetId, namespace: 'audio', name: datasetId, version: id, createdAt }) as DatasetVersion;

describe('datasetParentChoices', () => {
  it('このデータセットの最新のバージョンを既定で選び、このデータセットのバージョンを先に並べる', () => {
    const choices = datasetParentChoices(
      [
        version('other-2', 'other', '2026-10-11T03:00:00Z'),
        version('own-1', 'speech', '2026-10-10T00:00:00Z'),
        version('own-2', 'speech', '2026-10-11T01:00:00Z'),
      ],
      'speech',
    );
    expect(choices.defaultParentIds).toEqual(['own-2']);
    expect(choices.options.map((option) => option.label)).toEqual(['own-2', 'own-1', 'audio/other / other-2']);
  });

  it('このデータセットにまだバージョンが無ければ、何も選ばない', () => {
    expect(datasetParentChoices([version('other-1', 'other', '2026-10-11T00:00:00Z')], 'speech').defaultParentIds).toEqual([]);
  });
});
