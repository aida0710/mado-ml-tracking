import { useEffect, useState } from 'react';
import type { Artifact } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { sha256OfFile } from '../lib/fileSha256';
import { useSettledValue } from './useSettledValue';

// パスの入力が止まるのを待ってからAPIに問い合わせる。
const PATH_SETTLE_MS = 400;
// 候補は少しあれば足りる。パスを文字列として検索し、完全に一致するものを選び出す。
const PATH_MATCH_LIMIT = 20;
/** これより大きいファイルは「同じ内容」と言うためだけにハッシュを取らない。警告はそれ無しでも出る。 */
const SAME_CONTENT_CHECK_MAX_BYTES = 64 * 1024 * 1024;

/** 選んだファイルが入ろうとしているパスに、既に保存されているもの。 */
export interface ArtifactAtPath {
  existing: Artifact;
  /** 内容を比べなかった（サイズが違う、または大きすぎてすぐにはハッシュを取れない）ときはnull。 */
  isSameContent: boolean | null;
}

/**
 * Runの`path`（Runが無ければ、Runに属さないファイルの中の`path`）に保存された最新のArtifact。
 * アップロードするとそこに新しいバージョンが加わることと、選んだファイルが同じバイト列かどうかを
 * ダイアログで伝えるのに使う。
 */
export function useArtifactAtPath({
  projectId,
  runId,
  path,
  file,
}: {
  projectId: string;
  runId: string | null;
  path: string;
  file: File | null;
}): ArtifactAtPath | null {
  const { settled } = useSettledValue(path, PATH_SETTLE_MS);
  // 何を調べた答えかを付けておき、別のファイルやパスの答えを出さないようにする。
  const [found, setFound] = useState<{
    file: File;
    path: string;
    projectId: string;
    runId: string | null;
    artifactAtPath: ArtifactAtPath;
  } | null>(null);
  useEffect(() => {
    if (!file || settled === '') return;
    const controller = new AbortController();
    void (async () => {
      const candidates = await trackingApi.projectArtifacts(
        projectId,
        { limit: PATH_MATCH_LIMIT, query: settled, versions: 'latest', ...(runId ? { runId } : {}) },
        controller.signal,
      );
      const existing = candidates.find((artifact) => artifact.path === settled && artifact.runId === runId);
      if (!existing || controller.signal.aborted) return;
      const lookup = { file, path: settled, projectId, runId };
      setFound({ ...lookup, artifactAtPath: { existing, isSameContent: null } });
      if (existing.size !== file.size) {
        setFound({ ...lookup, artifactAtPath: { existing, isSameContent: false } });
        return;
      }
      if (file.size > SAME_CONTENT_CHECK_MAX_BYTES) return;
      const digest = await sha256OfFile(file, controller.signal);
      if (!controller.signal.aborted)
        setFound({ ...lookup, artifactAtPath: { existing, isSameContent: digest === existing.sha256 } });
      // 答えが無くてもダイアログが警告を出さないだけで、アップロードそのものには影響しない。
    })().catch(() => undefined);
    return () => controller.abort();
  }, [file, projectId, runId, settled]);
  const isCurrent =
    found !== null &&
    found.file === file &&
    found.path === settled &&
    found.projectId === projectId &&
    found.runId === runId;
  return isCurrent ? found.artifactAtPath : null;
}
