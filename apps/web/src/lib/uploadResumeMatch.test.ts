import { createHash, randomBytes } from 'node:crypto';
import type { ArtifactUploadDetail, ArtifactUploadListItem, ArtifactUploadPart } from '@mmt/contracts';
import { describe, expect, it, vi } from 'vitest';
import { RequestError } from '../api/http';
import {
  COMPARED_PART_LIMIT,
  choosePartsToCompare,
  createPartDigestReader,
  inspectSessionForFile,
  matchFileToSession,
  orderResumeCandidates,
} from './uploadResumeMatch';

const PART_SIZE = 1024;
const PART_COUNT = 10;
const NOW = Date.parse('2026-10-11T12:00:00Z');
const LATER = '2026-10-18T12:00:00Z';
const EARLIER = '2026-10-04T12:00:00Z';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function receivedPartsOf(bytes: Uint8Array, partNumbers: number[]): ArtifactUploadPart[] {
  return partNumbers.map((partNumber) => {
    const part = bytes.subarray((partNumber - 1) * PART_SIZE, partNumber * PART_SIZE);
    return { partNumber, size: part.length, sha256: sha256(part), receivedAt: EARLIER };
  });
}

function sessionDetail(bytes: Uint8Array, partNumbers: number[], overrides: Partial<ArtifactUploadDetail> = {}): ArtifactUploadDetail {
  return {
    id: 'upload-1',
    projectId: 'project-1',
    runId: 'run-1',
    path: 'checkpoints/step-12000/model.bin',
    backend: 'filesystem',
    mimeType: 'application/octet-stream',
    expectedSize: bytes.length,
    expectedSha256: null,
    partSize: PART_SIZE,
    partCount: Math.ceil(bytes.length / PART_SIZE),
    status: 'open',
    artifactId: null,
    error: null,
    expiresAt: LATER,
    createdAt: EARLIER,
    updatedAt: EARLIER,
    receivedParts: receivedPartsOf(bytes, partNumbers),
    ...overrides,
  };
}

function listItem(id: string, overrides: Partial<ArtifactUploadListItem> = {}): ArtifactUploadListItem {
  const { receivedParts: _receivedParts, ...session } = sessionDetail(new Uint8Array(PART_COUNT * PART_SIZE), []);
  return { ...session, id, receivedBytes: 0, ...overrides };
}

describe('choosePartsToCompare', () => {
  it('受信済みが上限以下なら全部、多ければ最初・最後と間を等間隔で選ぶ', () => {
    const parts = receivedPartsOf(randomBytes(PART_COUNT * PART_SIZE), [3, 1, 2]);
    expect(choosePartsToCompare(parts).map((part) => part.partNumber)).toEqual([1, 2, 3]);

    const many = receivedPartsOf(randomBytes(PART_COUNT * PART_SIZE), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const chosen = choosePartsToCompare(many).map((part) => part.partNumber);
    expect(chosen).toHaveLength(COMPARED_PART_LIMIT);
    expect(chosen[0]).toBe(1);
    expect(chosen.at(-1)).toBe(10);
    expect(chosen).toEqual([1, 4, 7, 10]);
  });
});

describe('matchFileToSession', () => {
  it('同じファイルなら、受信済みの部分が一致して続きにできる', async () => {
    const bytes = randomBytes(PART_COUNT * PART_SIZE + 100);
    const file = new Blob([bytes]);
    const match = await matchFileToSession({
      file,
      session: sessionDetail(bytes, [1, 2, 5, 11]),
      readPartDigest: createPartDigestReader(file),
    });
    expect(match).toEqual({ kind: 'same', nothingSent: false });
  });

  it('同じサイズでも中身の違うファイル（同じモデルの別のチェックポイント）は続きにしない', async () => {
    const sent = randomBytes(PART_COUNT * PART_SIZE);
    const other = randomBytes(PART_COUNT * PART_SIZE);
    const file = new Blob([other]);
    expect(
      await matchFileToSession({ file, session: sessionDetail(sent, [1, 2]), readPartDigest: createPartDigestReader(file) }),
    ).toEqual({ kind: 'contentDiffers' });
  });

  it('最初と最後のpartが同じでも、間のpartが違えば続きにしない', async () => {
    const sent = randomBytes(PART_COUNT * PART_SIZE);
    const finetuned = Uint8Array.from(sent);
    // Only the middle layers changed, as in a fine-tune that froze the embedding and output layers.
    finetuned.set(randomBytes(PART_SIZE * 3), PART_SIZE * 3);
    const file = new Blob([finetuned]);
    expect(
      await matchFileToSession({
        file,
        session: sessionDetail(sent, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
        readPartDigest: createPartDigestReader(file),
      }),
    ).toEqual({ kind: 'contentDiffers' });
  });

  it('サイズが違えば中身を読まずに断る', async () => {
    const sent = randomBytes(PART_COUNT * PART_SIZE);
    const readPartDigest = vi.fn();
    expect(
      await matchFileToSession({ file: new Blob([sent.subarray(1)]), session: sessionDetail(sent, [1]), readPartDigest }),
    ).toEqual({ kind: 'sizeDiffers' });
    expect(readPartDigest).not.toHaveBeenCalled();
  });

  it('まだ何も送っていなければ、サイズが同じファイルは混ざる心配がない', async () => {
    const sent = randomBytes(PART_COUNT * PART_SIZE);
    const file = new Blob([randomBytes(PART_COUNT * PART_SIZE)]);
    expect(
      await matchFileToSession({ file, session: sessionDetail(sent, []), readPartDigest: createPartDigestReader(file) }),
    ).toEqual({ kind: 'same', nothingSent: true });
  });
});

describe('createPartDigestReader', () => {
  it('同じ範囲は1回だけ読む', async () => {
    const bytes = randomBytes(PART_SIZE * 2);
    const file = new Blob([bytes]);
    const slice = vi.spyOn(file, 'slice');
    const readPartDigest = createPartDigestReader(file);
    const first = await readPartDigest({ start: 0, end: PART_SIZE });
    const again = await readPartDigest({ start: 0, end: PART_SIZE });
    expect(first).toBe(sha256(bytes.subarray(0, PART_SIZE)));
    expect(again).toBe(first);
    expect(slice).toHaveBeenCalledTimes(1);
  });
});

describe('inspectSessionForFile', () => {
  const bytes = randomBytes(PART_COUNT * PART_SIZE);
  const file = new Blob([bytes]);
  const inspect = (loadSession: () => Promise<ArtifactUploadDetail>, isKnownSameFile = false) =>
    inspectSessionForFile({
      uploadId: 'upload-1',
      file,
      loadSession,
      readPartDigest: createPartDigestReader(file),
      now: NOW,
      isKnownSameFile,
    });

  it('期限を過ぎたsessionは、掃除の前でも期限切れとして続きにしない', async () => {
    expect(await inspect(async () => sessionDetail(bytes, [1], { expiresAt: EARLIER }))).toMatchObject({
      blocker: 'expired',
    });
  });

  it('破棄・検証失敗のsessionはサーバーに残っていない扱いにする', async () => {
    for (const status of ['aborted', 'failed'] as const)
      expect(await inspect(async () => sessionDetail(bytes, [1], { status }))).toMatchObject({ blocker: 'gone' });
  });

  it('サーバーが消えた・権限が無い・別の認証情報と答えたら、その理由を返す', async () => {
    const refusals: [RequestError, string][] = [
      [new RequestError({ status: 404, code: 'not_found' }), 'gone'],
      [new RequestError({ status: 409, code: 'upload_expired' }), 'expired'],
      [new RequestError({ status: 403, code: 'project_forbidden' }), 'permissionLost'],
      [new RequestError({ status: 403, code: 'upload_forbidden' }), 'otherCredential'],
    ];
    for (const [failure, blocker] of refusals)
      expect(await inspect(() => Promise.reject(failure))).toEqual({ blocker, session: null });
  });

  it('通信が切れたときは、sessionについて何も分からないので例外のまま返す', async () => {
    const lost = new RequestError({ status: 0, code: 'network_error' });
    await expect(inspect(() => Promise.reject(lost))).rejects.toBe(lost);
  });

  it('同じFileで始めたsessionは中身を比べず、サイズだけ確かめる', async () => {
    const other = sessionDetail(randomBytes(PART_COUNT * PART_SIZE), [1]);
    expect(await inspect(async () => other, true)).toMatchObject({ blocker: null, nothingSent: false });
    expect(await inspect(async () => other, false)).toMatchObject({ blocker: 'contentDiffers' });
  });
});

describe('orderResumeCandidates', () => {
  it('サイズの同じ期限内のものだけを、このブラウザの記録があるもの、送信済みの多いものの順に並べる', () => {
    const size = PART_COUNT * PART_SIZE;
    const sessions = [
      listItem('small-progress', { receivedBytes: PART_SIZE }),
      listItem('other-size', { expectedSize: size + 1, receivedBytes: size }),
      listItem('expired', { expiresAt: EARLIER, receivedBytes: size }),
      listItem('far-along', { receivedBytes: PART_SIZE * 8 }),
      listItem('recorded', { receivedBytes: 0 }),
    ];
    expect(
      orderResumeCandidates({ sessions, fileSize: size, recordedUploadIds: new Set(['recorded']), now: NOW }).map(
        (session) => session.id,
      ),
    ).toEqual(['recorded', 'far-along', 'small-progress']);
  });
});
