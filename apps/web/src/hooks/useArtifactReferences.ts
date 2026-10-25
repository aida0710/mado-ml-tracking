import { useState } from 'react';
import { ARTIFACT_REFERENCES_BATCH_LIMIT, type ArtifactReferences } from '@mmt/contracts';
import { artifactLifecycleApi } from '../api/artifactLifecycle';
import { useQuery } from './useQuery';

/** Projectについて取得したもの。問い合わせたすべてのIDと、存在したIDの参照。 */
interface CheckedReferences {
  projectId: string;
  checkedIds: ReadonlySet<string>;
  byArtifactId: ReadonlyMap<string, ArtifactReferences>;
}

const noCheckedReferences = (projectId: string): CheckedReferences => ({
  projectId,
  checkedIds: new Set(),
  byArtifactId: new Map(),
});

/**
 * 渡した各Artifactが使われている場所（Artifact IDごと）。取得したものは持っておくので、一覧が
 * 伸びたとき（カタログの次のページ）は新しいIDだけをARTIFACT_REFERENCES_BATCH_LIMIT件ずつの要求で
 * 問い合わせ、その間も表示済みの行は参照を出したままにする。
 */
export function useArtifactReferences(projectId: string, artifactIds: readonly string[]) {
  const [state, setState] = useState(() => noCheckedReferences(projectId));
  const checked = state.projectId === projectId ? state : noCheckedReferences(projectId);
  const uncheckedIds = [...new Set(artifactIds)].filter((id) => !checked.checkedIds.has(id));
  const key = uncheckedIds.length ? `${projectId}:artifact-references:${uncheckedIds.join(',')}` : null;
  const query = useQuery({ key, load: async (signal) => {
    const batches: string[][] = [];
    for (let start = 0; start < uncheckedIds.length; start += ARTIFACT_REFERENCES_BATCH_LIMIT)
      batches.push(uncheckedIds.slice(start, start + ARTIFACT_REFERENCES_BATCH_LIMIT));
    const pages = await Promise.all(
      batches.map((batch) => artifactLifecycleApi.references(projectId, batch, signal)),
    );
    // APIは知らないIDを返さない。それらも問い合わせ済みとして扱い、もう一度は問い合わせない。
    return { askedIds: uncheckedIds, items: pages.flat() };
  } });

  // 各応答は、それを最初に見たレンダリングの中で1回だけ取り込む。
  const fetched = query.value;
  const [mergedAnswer, setMergedAnswer] = useState<typeof fetched>(undefined);
  if (fetched && fetched !== mergedAnswer) {
    setMergedAnswer(fetched);
    setState((previous) => {
      const kept = previous.projectId === projectId ? previous : noCheckedReferences(projectId);
      return {
        projectId,
        checkedIds: new Set([...kept.checkedIds, ...fetched.askedIds]),
        byArtifactId: new Map([
          ...kept.byArtifactId,
          ...fetched.items.map((references) => [references.artifactId, references] as const),
        ]),
      };
    });
  }

  return {
    byArtifactId: checked.byArtifactId,
    /** Artifactの参照が分かっているか。読み込み中と失敗した後はfalse。 */
    isChecked: (artifactId: string) => checked.checkedIds.has(artifactId),
    error: query.error,
    /** 取得したものを捨てて、すべてのIDをもう一度問い合わせる。 */
    reload: () => {
      setState(noCheckedReferences(projectId));
      query.reload();
    },
  };
}

/** Artifactを保持しているものがあるか。あれば削除は断られる。 */
export function hasArtifactReferences(references: ArtifactReferences): boolean {
  return (
    references.modelVersions.length +
      references.datasetVersions.length +
      references.codeVersions.length +
      references.checkpoints.length +
      (references.preprocessingReports?.length ?? 0) >
    0
  );
}
