import { describe, expect, it } from 'vitest';
import type { UploadSource } from './droppedFiles';
import {
  createDatasetFolderUploadFolder,
  datasetFolderProgress,
  datasetPathsOf,
  planDatasetFolder,
} from './datasetFolder';
import { DATASET_FOLDER_UPLOAD_FOLDER_PATTERN } from '@mmt/contracts';

const source = (relativePath: string): UploadSource => ({
  file: new File(['x'], relativePath.split('/').pop()!),
  relativePath,
});

describe('datasetPathsOf', () => {
  it('フォルダを選ぶと、全ファイルに共通するフォルダ名を除いたパスになる', () => {
    expect(datasetPathsOf([source('corpus/train/a.wav'), source('corpus/meta.jsonl')])).toEqual([
      'train/a.wav',
      'meta.jsonl',
    ]);
  });

  it('ばらばらに選んだファイルや、最上位が異なるファイルはそのままのパスになる', () => {
    expect(datasetPathsOf([source('a.wav'), source('b.wav')])).toEqual(['a.wav', 'b.wav']);
    expect(datasetPathsOf([source('one/a.wav'), source('two/b.wav')])).toEqual([
      'one/a.wav',
      'two/b.wav',
    ]);
  });
});

describe('planDatasetFolder', () => {
  it('uploadごとに別のArtifactフォルダへ置き、データセット内のパスは保つ', () => {
    const [entry] = planDatasetFolder([source('corpus/train/a.wav')], {
      datasetId: 'dataset-1',
      folder: 'upload-1',
    });
    expect(entry).toMatchObject({
      datasetPath: 'train/a.wav',
      artifactPath: 'datasets/dataset-1/upload-1/train/a.wav',
    });
  });
});

describe('datasetFolderProgress', () => {
  const entries = planDatasetFolder([source('corpus/a.wav'), source('corpus/sub/big.bin')], {
    datasetId: 'dataset-1',
    folder: 'upload-1',
  });
  const [wav, big] = entries.map((entry) => entry.artifactPath);

  it('取消したファイルがあるとバージョンの作成へ進まず、そのファイルを残りとして返す', () => {
    const progress = datasetFolderProgress(entries, [
      { id: '1', path: wav!, status: 'completed', artifact: { id: 'artifact-a' } },
      { id: '2', path: big!, status: 'canceled', artifact: null },
    ]);
    expect(progress.isUploaded).toBe(false);
    expect(progress.unfinishedItemIds).toEqual(['2']);
    expect([...progress.storedArtifactIds.values()]).toEqual(['artifact-a']);
  });

  it('残りを除いた一覧では、保存済みのファイルだけでバージョンを作れる', () => {
    const progress = datasetFolderProgress(entries.slice(0, 1), [
      { id: '1', path: wav!, status: 'completed', artifact: { id: 'artifact-a' } },
      { id: '2', path: big!, status: 'canceled', artifact: null },
    ]);
    expect(progress.isUploaded).toBe(true);
    expect(progress.unfinishedItemIds).toEqual([]);
  });
});

describe('createDatasetFolderUploadFolder', () => {
  it('開始時刻からAPIが途中のアップロードとして見つけられる名前を作る', () => {
    const folder = createDatasetFolderUploadFolder(new Date('2026-10-08T14:19:08.955Z'));
    expect(folder).toBe('2026-10-08T14-19-08-955Z');
    expect(new RegExp(DATASET_FOLDER_UPLOAD_FOLDER_PATTERN).test(folder)).toBe(true);
  });
});

describe('datasetFolderProgress（前回の続き）', () => {
  it('前回保存済みのファイルはキューに無くても保存済みとして数え、そのArtifactでバージョンを作る', () => {
    const [stored, sent] = planDatasetFolder([source('corpus/a.wav'), source('corpus/b.wav')], {
      datasetId: 'dataset-1',
      folder: 'upload-1',
    });
    const progress = datasetFolderProgress(
      [{ ...stored!, storedArtifactId: 'artifact-earlier' }, sent!],
      [{ id: '1', path: sent!.artifactPath, status: 'completed', artifact: { id: 'artifact-b' } }],
    );
    expect(progress.isUploaded).toBe(true);
    expect([...progress.storedArtifactIds.values()]).toEqual(['artifact-earlier', 'artifact-b']);
  });
});
