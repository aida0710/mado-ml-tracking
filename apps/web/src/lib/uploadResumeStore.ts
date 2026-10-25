// 開いているアップロードセッションをlocalStorageに覚え、再読み込みしても同じファイルを
// 再開できるようにする。ストレージが無いか一杯のとき（プライベートウィンドウ、容量の上限）も、
// 再開ができないだけでアップロードは動く。

const STORAGE_KEY = 'mmt.artifactUploads.v1';

/** 再読み込み後に「同じファイル」を見分ける材料。ブラウザからは固定のファイルハンドルが得られない。 */
export interface UploadResumeRecord {
  uploadId: string;
  projectId: string;
  runId: string | null;
  path: string;
  name: string;
  size: number;
  lastModified: number;
}

function readRecords(): UploadResumeRecord[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter(isResumeRecord) : [];
  } catch {
    return [];
  }
}

function writeRecords(records: UploadResumeRecord[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ストレージが無くても、サーバーにある開いたセッションの一覧から再開できる。
  }
}

function isResumeRecord(value: unknown): value is UploadResumeRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.uploadId === 'string' &&
    typeof record.projectId === 'string' &&
    (record.runId === null || typeof record.runId === 'string') &&
    typeof record.path === 'string' &&
    typeof record.name === 'string' &&
    typeof record.size === 'number' &&
    typeof record.lastModified === 'number'
  );
}

export function findResumeRecord(target: Omit<UploadResumeRecord, 'uploadId'>): UploadResumeRecord | null {
  return (
    readRecords().find(
      (record) =>
        record.projectId === target.projectId &&
        record.runId === target.runId &&
        record.path === target.path &&
        record.name === target.name &&
        record.size === target.size &&
        record.lastModified === target.lastModified,
    ) ?? null
  );
}

/** このブラウザが、名前・大きさ・時刻が同じファイルで始めたセッション（パスは問わない）。 */
export function findUploadIdsRecordedForFile(
  target: Pick<UploadResumeRecord, 'projectId' | 'runId' | 'name' | 'size' | 'lastModified'>,
): Set<string> {
  return new Set(
    readRecords()
      .filter(
        (record) =>
          record.projectId === target.projectId &&
          record.runId === target.runId &&
          record.name === target.name &&
          record.size === target.size &&
          record.lastModified === target.lastModified,
      )
      .map((record) => record.uploadId),
  );
}

/** このブラウザがそのセッションで送っていたファイル。どのファイルを選べばよいかを利用者に伝えるため。 */
export function findResumeRecordByUploadId(uploadId: string): UploadResumeRecord | null {
  return readRecords().find((record) => record.uploadId === uploadId) ?? null;
}

export function saveResumeRecord(record: UploadResumeRecord) {
  writeRecords([...readRecords().filter((item) => item.uploadId !== record.uploadId), record]);
}

export function removeResumeRecord(uploadId: string) {
  writeRecords(readRecords().filter((item) => item.uploadId !== uploadId));
}
