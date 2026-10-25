import { isUuid } from './uuid';

// 完了したArtifactについて、アップロードのパネル（UploadQueuePanel）が表示するURI。
export const ARTIFACT_URI_SCHEME = 'artifact://';
// RunのArtifactsタブがidの前に付けるラベル（「Artifact ID: <id>」）。idと一緒にコピーされる。
const ARTIFACT_ID_LABEL_PATTERN = /^artifact\s*id\s*[:：]\s*/i;
// Artifactへのリンクの中のid。たとえば内容のURL（/api/projects/<p>/artifacts/<id>/content）。
const ARTIFACT_LINK_PATTERN = /\/artifacts\/([0-9a-f-]{36})(?=[/?#]|$)/i;

/**
 * 貼り付けた値の中のArtifactのid。idそのもの（アップロードのパネルのコピーボタン）、パネルが
 * 表示する`artifact://<id>`のURI、「Artifact ID:」のラベルごとコピーしたid、Artifactへのリンクの
 * いずれか。それ以外はnullで、欄は保存したパスでの検索として扱う。
 */
export function parseArtifactReference(input: string): string | null {
  const value = input.trim().replace(ARTIFACT_ID_LABEL_PATTERN, '');
  const withoutScheme = value.toLowerCase().startsWith(ARTIFACT_URI_SCHEME)
    ? value.slice(ARTIFACT_URI_SCHEME.length)
    : value;
  if (isUuid(withoutScheme)) return withoutScheme.toLowerCase();
  const linked = value.match(ARTIFACT_LINK_PATTERN)?.[1];
  return linked && isUuid(linked) ? linked.toLowerCase() : null;
}
