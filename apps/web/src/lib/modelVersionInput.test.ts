import type { Artifact, DataCatalogReference } from '@mmt/contracts';
import { describe, expect, it } from 'vitest';
import { buildModelVersionInput, EMPTY_MODEL_VERSION_DRAFT, withSourceRun } from './modelVersionInput';

const NOT_CONNECTED: DataCatalogReference = { url: null, storageConnections: [] };
const CONNECTED: DataCatalogReference = {
  url: 'https://catalog.example.test',
  storageConnections: [{ id: 'onprem01', name: 'on-premises', provider: 'onprem' }],
};
const weights = { id: 'e45e89c3-9dca-4571-956e-bea81eb292e9', path: 'model/weights.bin' } as Artifact;

describe('バージョンの作成の入力', () => {
  it('バージョンが空欄なら送らず、APIの自動採番に任せる', () => {
    expect(buildModelVersionInput({ ...EMPTY_MODEL_VERSION_DRAFT, version: '  ' }, NOT_CONNECTED)).toEqual({
      parentModelVersionIds: [],
      metadata: {},
    });
  });

  it('選んだ生成元Run・重みのArtifact・親・既定のコードをそのまま送る', () => {
    expect(
      buildModelVersionInput({
        ...EMPTY_MODEL_VERSION_DRAFT,
        version: ' 3 ',
        sourceRunId: 'run-1',
        weightsArtifact: weights,
        weightsSearch: 'weights',
        weightsUri: ' s3://bucket/weights.bin ',
        parentVersionIds: ['parent-1'],
        defaultCodeVersionId: 'code-1',
        metadata: '{"note":"手動"}',
      }, NOT_CONNECTED),
    ).toEqual({
      version: '3',
      parentModelVersionIds: ['parent-1'],
      sourceRunId: 'run-1',
      artifactId: weights.id,
      weightsUri: 's3://bucket/weights.bin',
      defaultCodeVersionId: 'code-1',
      metadata: { note: '手動' },
    });
  });

  it('接続済みでweightsUriがs3://のときだけ、選んだストレージ接続を送る', () => {
    const draft = { ...EMPTY_MODEL_VERSION_DRAFT, storageConnectionId: 'onprem01' };
    expect(
      buildModelVersionInput({ ...draft, weightsUri: 's3://bucket/weights.bin' }, CONNECTED),
    ).toMatchObject({ dataCatalogStorageConnectionId: 'onprem01' });
    // s3://でないURIに変えたあとに残った選択は送らない。
    expect(
      buildModelVersionInput({ ...draft, weightsUri: 'file:///weights.bin' }, CONNECTED),
    ).not.toHaveProperty('dataCatalogStorageConnectionId');
    expect(
      buildModelVersionInput({ ...draft, weightsUri: 's3://bucket/weights.bin' }, NOT_CONNECTED),
    ).not.toHaveProperty('dataCatalogStorageConnectionId');
  });

  it('重みを検索したまま選んでいなければ、保存せずに選ぶよう求める', () => {
    expect(() =>
      buildModelVersionInput({ ...EMPTY_MODEL_VERSION_DRAFT, weightsSearch: 'weights' }, NOT_CONNECTED),
    ).toThrow('一覧から選んでください');
  });

  it('MetadataがJSONのオブジェクトでなければ止める', () => {
    expect(() =>
      buildModelVersionInput({ ...EMPTY_MODEL_VERSION_DRAFT, metadata: '[1]' }, NOT_CONNECTED),
    ).toThrow();
  });
});

describe('生成元Runを選び直したときの重み', () => {
  const fromRun = { ...weights, runId: 'run-1' } as Artifact;
  const withoutRun = { ...weights, runId: null } as Artifact;
  const picked = (artifact: Artifact) => ({
    ...EMPTY_MODEL_VERSION_DRAFT,
    sourceRunId: 'run-1',
    weightsArtifact: artifact,
    weightsSearch: 'model',
  });

  it('前のRunから選んだ重みは、別のRunに変えると外れる', () => {
    expect(withSourceRun(picked(fromRun), 'run-2')).toMatchObject({
      sourceRunId: 'run-2',
      weightsArtifact: null,
      weightsSearch: '',
    });
  });

  it('Runの無いArtifact（アップロード・貼り付け）は残る', () => {
    expect(withSourceRun(picked(withoutRun), 'run-2').weightsArtifact).toBe(withoutRun);
  });

  it('Runを外しても、選んだ重みは残る', () => {
    expect(withSourceRun(picked(fromRun), '').weightsArtifact).toBe(fromRun);
  });
});
