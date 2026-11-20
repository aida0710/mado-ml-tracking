import { describe, expect, it } from 'vitest';
import type { DataCatalogReference } from '@mmt/contracts';
import { dataCatalogStorageUrlOf, needsStorageConnection } from './dataCatalogStorage';

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

describe('needsStorageConnection', () => {
  it('接続済みでURIがs3://のときだけ、ストレージ接続を選ぶ必要がある', () => {
    expect(needsStorageConnection(reference, ' s3://corpus/ja/ ')).toBe(true);
    expect(needsStorageConnection(reference, 'https://example.test/data.tar')).toBe(false);
    expect(needsStorageConnection(notConnected, 's3://corpus/ja/')).toBe(false);
  });
});
