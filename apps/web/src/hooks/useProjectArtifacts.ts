import { useState } from 'react';
import type { Artifact } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { useCursorPages } from './useCursorPages';
import { useQuery } from './useQuery';
import { ARTIFACT_LIST_LIMIT } from '../lib/artifactCatalog';

/**
 * 保存されたパスに`search`を含むProjectのArtifactを新しい順に並べたもの。Artifactを1つ選ぶ欄で
 * 使う。`runId`を渡すと、そのRunのArtifactのタブが出すとおりの、そのRunのファイルだけ（パスごとに
 * 最新のもの）。`rememberArtifact`は、検索を変えた後も選んだArtifactを一覧に残す。
 */
export function useProjectArtifacts({
  projectId,
  enabled,
  search,
  runId,
}: {
  projectId: string;
  enabled: boolean;
  search: string;
  runId?: string;
}) {
  const query = useQuery({
    key: enabled ? `${projectId}:project-artifacts:${runId ?? ''}:${search}` : null,
    load: (signal) =>
      trackingApi.projectArtifacts(
        projectId,
        {
          limit: ARTIFACT_LIST_LIMIT,
          query: search,
          ...(runId ? { runId, versions: 'latest' as const } : {}),
        },
        signal,
      ),
  });
  const [selectedArtifacts, setSelectedArtifacts] = useState<Artifact[]>([]);
  const items = [
    ...new Map(
      [...(query.value ?? []), ...selectedArtifacts].map((artifact) => [artifact.id, artifact]),
    ).values(),
  ];
  function rememberArtifact(artifact: Artifact) {
    setSelectedArtifacts((previous) => [
      ...previous.filter((item) => item.id !== artifact.id),
      artifact,
    ]);
  }
  return { ...query, items, rememberArtifact };
}

export interface ProjectArtifactFilter {
  query: string;
  /** `type/*`、またはすべての種類なら''。 */
  mimeType: string;
  runId: string;
  /** modelVersionIdとともに''なら、すべてのArtifact。モデルだけなら、そのすべてのバージョンを含む。 */
  modelId: string;
  modelVersionId: string;
  includePreviousVersions: boolean;
}

// カタログのAPIは500件まで許すが、小さいページにすると最初の画面が早く出る。
const PROJECT_ARTIFACT_PAGE_SIZE = 100;

/** Project全体のArtifactのカタログ。新しい順にページごとに読む。 */
export function useProjectArtifactCatalog(projectId: string, filter: ProjectArtifactFilter) {
  return useCursorPages(
    `${projectId}:artifact-catalog:${JSON.stringify(filter)}`,
    (cursor, signal) =>
      trackingApi.projectArtifactPage(
        projectId,
        {
          limit: PROJECT_ARTIFACT_PAGE_SIZE,
          query: filter.query || undefined,
          mimeType: filter.mimeType || undefined,
          runId: filter.runId || undefined,
          modelId: filter.modelId || undefined,
          modelVersionId: filter.modelVersionId || undefined,
          versions: filter.includePreviousVersions ? 'all' : 'latest',
          cursor,
        },
        signal,
      ),
  );
}
