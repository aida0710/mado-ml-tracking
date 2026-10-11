import { describe, expect, it } from 'vitest';
import { parseArtifactReference } from './artifactReference';

const ARTIFACT_ID = 'e45e89c3-9dca-4571-956e-bea81eb292e9';

describe('貼り付けた値からArtifactのIDを読む', () => {
  it.each([
    ['IDだけ（アップロード後の［コピー］）', ARTIFACT_ID],
    ['アップロード後に表示される artifact://', `artifact://${ARTIFACT_ID}`],
    ['前後の空白と大文字', `  ARTIFACT://${ARTIFACT_ID.toUpperCase()}\n`],
    ['RunのArtifactsタブの「Artifact ID:」ごと', `Artifact ID: ${ARTIFACT_ID}`],
    ['ダウンロードのリンク', `http://127.0.0.1:5182/api/projects/p/artifacts/${ARTIFACT_ID}/content`],
  ])('%sはIDとして受け付ける', (_name, pasted) => {
    expect(parseArtifactReference(pasted)).toBe(ARTIFACT_ID);
  });

  it.each([
    ['保存パス', 'model/weights.safetensors'],
    ['IDの一部', ARTIFACT_ID.slice(0, 8)],
    ['IDの後ろに文字が続く', `artifact://${ARTIFACT_ID}x`],
    ['空', '   '],
  ])('%sはIDとして扱わず検索に回す', (_name, typed) => {
    expect(parseArtifactReference(typed)).toBeNull();
  });
});
