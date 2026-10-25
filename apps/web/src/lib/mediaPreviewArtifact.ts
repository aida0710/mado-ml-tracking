import type { Artifact, RunMedia } from '@mmt/contracts';
import type { ResolvedMediaCell } from './mediaTableCells';

/**
 * components/preview/のプレビューはArtifactを受け取るが、読むのはid、projectId、runId、path、
 * mimeType、sizeだけ。Runのメディアと表のセルはちょうどそれを持っているので、セルごとに
 * GET /artifacts/:idをしなくてもプレビューに渡せる。保存先の項目は、どのプレビューも
 * 読まないので空にする。
 */
function previewArtifact(fields: Pick<Artifact, 'id' | 'projectId' | 'runId' | 'path' | 'mimeType' | 'size'>): Artifact {
  return { ...fields, backend: 'filesystem', storageKey: '', sha256: '', createdAt: '' };
}

export function runMediaArtifact(projectId: string, media: RunMedia): Artifact {
  return previewArtifact({
    id: media.artifactId,
    projectId,
    runId: media.runId,
    path: media.path,
    mimeType: media.mimeType,
    size: media.size,
  });
}

// 表のセルはMIME typeを持たないので、セルの種類でプレビューを選ぶ。
const DEFAULT_MIME_TYPES: Record<ResolvedMediaCell['type'], string> = {
  audio: 'audio/wav',
  image: 'image/png',
  video: 'video/mp4',
};

export function tableCellArtifact(projectId: string, cell: ResolvedMediaCell): Artifact {
  return previewArtifact({
    id: cell.artifactId,
    projectId,
    runId: cell.runId,
    path: cell.path,
    // 表のセルはMIME typeも大きさも持たない。プレビューは中身そのものからデコードする。
    mimeType: DEFAULT_MIME_TYPES[cell.type],
    // 0ならブラウザでの解析のままになるので、セルが大きさを持つまでは64MiBを超えるセルも丸ごと取得する。
    size: 0,
  });
}
