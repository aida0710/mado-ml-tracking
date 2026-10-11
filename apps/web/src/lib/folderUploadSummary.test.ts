import { describe, expect, it } from 'vitest';
import { planDatasetFolder } from './datasetFolder';
import type { UploadSource } from './droppedFiles';
import { summarizeFolderUpload, type FolderUploadItemState } from './folderUploadSummary';

const source = (relativePath: string, bytes: number): UploadSource => ({
  file: new File([new Uint8Array(bytes)], relativePath.split('/').pop()!),
  relativePath,
});

describe('summarizeFolderUpload', () => {
  const [reused, done, sending, waiting, failed] = planDatasetFolder(
    [
      source('corpus/a.wav', 100),
      source('corpus/b.wav', 200),
      source('corpus/sub/c.wav', 300),
      source('corpus/d.wav', 400),
      source('corpus/e.wav', 500),
    ],
    { datasetId: 'dataset-1', folder: 'upload-1' },
  );
  const entries = [{ ...reused!, storedArtifactId: 'artifact-a' }, done!, sending!, waiting!, failed!];
  const item = (entryPath: string, state: Partial<FolderUploadItemState>): FolderUploadItemState => ({
    id: entryPath,
    path: entryPath,
    status: 'queued',
    size: 0,
    sentBytes: 0,
    bytesPerSecond: null,
    ...state,
  });
  const items = [
    item(done!.artifactPath, { status: 'completed', sentBytes: 200 }),
    item(sending!.artifactPath, { status: 'uploading', sentBytes: 100, bytesPerSecond: 50 }),
    item(waiting!.artifactPath, {}),
    item(failed!.artifactPath, { status: 'failed', sentBytes: 0 }),
  ];

  it('前回の続きで送らなかったファイルも、件数とバイト数の両方で完了に数える', () => {
    const summary = summarizeFolderUpload(entries, items);
    expect(summary).toMatchObject({
      totalFiles: 5,
      doneFiles: 2,
      reusedFiles: 1,
      queuedFiles: 1,
      hasFailed: true,
      totalBytes: 1500,
      sentBytes: 400,
      bytesPerSecond: 50,
      remainingSeconds: 22,
    });
  });

  it('送信中と失敗のファイルだけを、データセットの中のパスで行に出す', () => {
    const summary = summarizeFolderUpload(entries, items);
    expect(summary.shownItems.map(summary.nameOf)).toEqual(['sub/c.wav', 'e.wav']);
  });
});
