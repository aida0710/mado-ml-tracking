import { describe, expect, it } from 'vitest';
import type { DataCatalogReference } from '@mmt/contracts';
import {
  acceptsStorageConnection,
  dataCatalogStorageUrlOf,
  isStorageConnectionMissing,
  storageConnectionOptions,
} from './dataCatalogStorage';

const reference: DataCatalogReference = {
  url: 'https://catalog.example.test',
  storageConnections: [{ id: 'onprem01', name: 'on-premises', provider: 'onprem' }],
};
const notConnected: DataCatalogReference = { url: null, storageConnections: [] };

describe('dataCatalogStorageUrlOf', () => {
  it('一覧にあるストレージ接続のs3://のURIは、その画面のURLになる', () => {
    expect(
      dataCatalogStorageUrlOf(reference, { uri: 's3://corpus/ja/', storageConnectionId: 'onprem01' }),
    ).toBe('https://catalog.example.test/storage/onprem01/corpus/ja/');
  });
  it('ストレージ接続が無い、一覧に無い、未接続、s3://でないときはURLにしない', () => {
    const stored = { uri: 's3://corpus/ja/', storageConnectionId: 'onprem01' };
    expect(dataCatalogStorageUrlOf(reference, { ...stored, storageConnectionId: null })).toBeUndefined();
    expect(dataCatalogStorageUrlOf(reference, { ...stored, storageConnectionId: 'gone' })).toBeUndefined();
    expect(dataCatalogStorageUrlOf(notConnected, stored)).toBeUndefined();
    expect(dataCatalogStorageUrlOf(reference, { ...stored, uri: 'file:///data' })).toBeUndefined();
  });
});

describe('acceptsStorageConnection', () => {
  it('接続済みでURIがs3://のときだけ、ストレージ接続を選ぶ必要がある', () => {
    expect(acceptsStorageConnection(reference, ' s3://corpus/ja/ ')).toBe(true);
    expect(acceptsStorageConnection(reference, 'https://example.test/data.tar')).toBe(false);
    expect(acceptsStorageConnection(notConnected, 's3://corpus/ja/')).toBe(false);
  });
});

describe('storageConnectionOptions', () => {
  const texts = { unset: '未設定', notFound: '見つかりません' };

  it('先頭が未設定で、続けて一覧のストレージ接続を名前と種類で並べる', () => {
    expect(storageConnectionOptions(reference.storageConnections, texts)[0]).toEqual({
      value: '',
      label: '未設定',
    });
    expect(storageConnectionOptions(reference.storageConnections, texts)).toHaveLength(
      reference.storageConnections.length + 1,
    );
  });

  it('今のIDが一覧に無ければ、見つからない接続として選択肢に残す', () => {
    const options = storageConnectionOptions(reference.storageConnections, texts, 'gone01');
    expect(options.at(-1)).toEqual({ value: 'gone01', label: '見つかりません (gone01)' });
  });
});

describe('isStorageConnectionMissing', () => {
  it('接続済みで、登録してあるIDが一覧に無いときだけ真', () => {
    expect(isStorageConnectionMissing(reference, 'gone01')).toBe(true);
    expect(isStorageConnectionMissing(reference, reference.storageConnections[0]!.id)).toBe(false);
    expect(isStorageConnectionMissing(reference, null)).toBe(false);
    expect(isStorageConnectionMissing(notConnected, 'gone01')).toBe(false);
  });
});
