import { describe, expect, it } from 'vitest';
import type { ArtifactUploadListItem, DatasetFolderUpload } from '@mmt/contracts';
import { planDatasetFolder } from './datasetFolder';
import {
  chooseFolderToContinue,
  countContinuedFiles,
  folderOfUploadPath,
  folderUploadStartTime,
  mergeUnfinishedFolderUploads,
  pairWithStoredFiles,
} from './datasetFolderResume';
import type { UploadSource } from './droppedFiles';

const DATASET = 'd0000000-0000-4000-8000-000000000001';
const EARLIER = '2026-10-11T05-52-01-123Z';
const LATER = '2026-10-11T06-10-44-001Z';

const source = (relativePath: string, bytes: number): UploadSource => ({
  file: new File([new Uint8Array(bytes)], relativePath.split('/').pop()!),
  relativePath,
});
const session = (path: string, expectedSize: number, runId: string | null = null) =>
  ({ id: `session-${path}`, path, expectedSize, runId, receivedBytes: 0 }) as ArtifactUploadListItem;
const stored = (folder: string, fileCount: number): DatasetFolderUpload => ({
  folder,
  pathPrefix: `datasets/${DATASET}/${folder}/`,
  fileCount,
  totalSize: fileCount * 10,
  firstStoredAt: '2026-10-11T05:52:02.000Z',
  lastStoredAt: '2026-10-11T05:55:00.000Z',
});

describe('folderUploadStartTime / folderOfUploadPath', () => {
  it('フォルダ名から開始時刻を戻し、フォルダのアップロードのパスからだけフォルダを取り出す', () => {
    expect(folderUploadStartTime(EARLIER)).toBe('2026-10-11T05:52:01.123Z');
    expect(folderOfUploadPath(`datasets/${DATASET}/${EARLIER}/a/b.wav`, DATASET)).toBe(EARLIER);
    expect(folderOfUploadPath(`datasets/${DATASET}/train/b.wav`, DATASET)).toBeNull();
    expect(folderOfUploadPath(`datasets/${DATASET}/${EARLIER}`, DATASET)).toBeNull();
    expect(folderOfUploadPath(`datasets/other/${EARLIER}/b.wav`, DATASET)).toBeNull();
  });
});

describe('mergeUnfinishedFolderUploads', () => {
  it('保存済みのファイルと自分の開いたアップロードをフォルダごとにまとめ、新しい順に並べる', () => {
    const merged = mergeUnfinishedFolderUploads({
      datasetId: DATASET,
      stored: [stored(EARLIER, 98)],
      openUploads: [
        session(`datasets/${DATASET}/${EARLIER}/big.bin`, 50),
        session(`datasets/${DATASET}/${LATER}/only-open.bin`, 70),
        // A Run's upload and another path are not folder uploads of this dataset.
        session(`datasets/${DATASET}/${LATER}/run.bin`, 70, 'run-1'),
        session('checkpoints/model.bin', 90),
      ],
    });
    expect(merged.map(({ folder, storedFileCount, openUploads }) => ({ folder, storedFileCount, open: openUploads.length }))).toEqual([
      { folder: LATER, storedFileCount: 0, open: 1 },
      { folder: EARLIER, storedFileCount: 98, open: 1 },
    ]);
  });
});

describe('続きの判定', () => {
  const entries = planDatasetFolder(
    [source('corpus/a.wav', 10), source('corpus/b.wav', 20), source('corpus/c.wav', 30)],
    { datasetId: DATASET, folder: EARLIER },
  );
  const prefix = `datasets/${DATASET}/${EARLIER}/`;

  it('同じパスで同じ大きさの保存済みファイルだけを、中身を比べる組にする', () => {
    const pairs = pairWithStoredFiles(entries, [
      { id: 'artifact-a', path: `${prefix}a.wav`, size: 10, sha256: 'x' },
      { id: 'artifact-b', path: `${prefix}b.wav`, size: 21, sha256: 'y' },
    ]);
    expect(pairs.map(({ entry, stored: file }) => [entry.datasetPath, file.id])).toEqual([['a.wav', 'artifact-a']]);
  });

  it('保存済みと送りかけの両方を数え、いちばん多く重なる試みを続きに選ぶ', () => {
    const count = countContinuedFiles({
      entries,
      storedFiles: [{ id: 'artifact-a', path: `${prefix}a.wav`, size: 10, sha256: 'x' }],
      openUploads: [session(`${prefix}c.wav`, 30)],
    });
    expect(count).toBe(2);
    expect(
      chooseFolderToContinue([
        { folder: LATER, matchedCount: 1 },
        { folder: EARLIER, matchedCount: count },
      ]),
    ).toEqual({ folder: EARLIER, matchedCount: 2 });
    expect(chooseFolderToContinue([{ folder: LATER, matchedCount: 0 }])).toBeNull();
  });
});
