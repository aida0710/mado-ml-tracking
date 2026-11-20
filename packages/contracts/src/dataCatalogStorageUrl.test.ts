import { describe, expect, it } from 'vitest';
import {
  dataCatalogStorageUrl,
  parseS3Uri,
  parseDataCatalogStorageUrl,
} from './dataCatalogStorageUrl.js';

const DATA_CATALOG_URL = 'https://catalog.example.test';

describe('parseS3Uri', () => {
  it('バケットとキーに分け、フォルダの末尾の/を残す', () => {
    expect(parseS3Uri('s3://corpus/ja/train/')).toEqual({ bucket: 'corpus', key: 'ja/train/' });
    expect(parseS3Uri('s3://corpus')).toEqual({ bucket: 'corpus', key: '' });
  });
  it('s3://でないURIとバケットの無いURIはnullになる', () => {
    expect(parseS3Uri('https://example.test/data.tar')).toBeNull();
    expect(parseS3Uri('s3:///key')).toBeNull();
  });
});

describe('dataCatalogStorageUrl', () => {
  it('接続ID・バケット・パスの各部分を符号化して画面のURLにする', () => {
    expect(
      dataCatalogStorageUrl({
        dataCatalogUrl: DATA_CATALOG_URL,
        storageConnectionId: 'c 1',
        location: { bucket: 'corpus', key: 'ja/音声 1/a#b.wav' },
      }),
    ).toBe(
      'https://catalog.example.test/storage/c%201/corpus/ja/%E9%9F%B3%E5%A3%B0%201/a%23b.wav',
    );
  });
  it('画面のURLにパスがあれば、その下に作る', () => {
    expect(
      dataCatalogStorageUrl({
        dataCatalogUrl: 'https://example.test/catalog',
        storageConnectionId: 'c1',
        location: { bucket: 'corpus', key: '' },
      }),
    ).toBe('https://example.test/catalog/storage/c1/corpus/');
  });
});

describe('parseDataCatalogStorageUrl', () => {
  const convert = (storageUrl: string, dataCatalogUrl = DATA_CATALOG_URL) =>
    parseDataCatalogStorageUrl({ dataCatalogUrl, storageUrl })?.uri ?? null;

  it('dataCatalogStorageUrlが作ったURLは元のURIに戻る', () => {
    for (const uri of ['s3://corpus/ja/音声 1/', 's3://corpus/ja/a#b.wav', 's3://corpus/']) {
      const storageUrl = dataCatalogStorageUrl({
        dataCatalogUrl: DATA_CATALOG_URL,
        storageConnectionId: 'c1',
        location: parseS3Uri(uri)!,
      });
      expect(convert(storageUrl)).toBe(uri);
    }
  });
  it('URLにあるストレージ接続のIDも返す', () => {
    expect(
      parseDataCatalogStorageUrl({
        dataCatalogUrl: DATA_CATALOG_URL,
        storageUrl: 'https://catalog.example.test/storage/c%201/corpus/ja/',
      }),
    ).toEqual({ storageConnectionId: 'c 1', uri: 's3://corpus/ja/' });
  });
  it('ファイルの画面のURLは、previewのキーをURIにする', () => {
    expect(
      convert('https://catalog.example.test/storage/c1/corpus/ja/?preview=ja%2Fa%20b.wav'),
    ).toBe('s3://corpus/ja/a b.wav');
    // tarの中のエントリを開いたURLは、tarそのものを指す。
    expect(
      convert('https://catalog.example.test/storage/c1/corpus/?preview=s.tar&entry=a%2Fb.wav'),
    ).toBe('s3://corpus/s.tar');
  });
  it('画面のURLにパスがあれば、それを除いて読む', () => {
    expect(
      convert('https://example.test/catalog/storage/c1/corpus/ja/', 'https://example.test/catalog'),
    ).toBe('s3://corpus/ja/');
  });
  it('ストレージの画面でないURLはnullになる', () => {
    expect(convert('https://other.example.test/storage/c1/corpus/ja/')).toBeNull();
    expect(convert('https://catalog.example.test/settings/connections')).toBeNull();
    expect(convert('https://catalog.example.test/storage/c1/')).toBeNull();
    expect(convert('https://catalog.example.test/storage/c1/edit-readme/corpus/ja/')).toBeNull();
    expect(convert('https://catalog.example.test/storage/c1/corpus/%E0%A4%A')).toBeNull();
    expect(convert('s3://corpus/ja/')).toBeNull();
  });
});
