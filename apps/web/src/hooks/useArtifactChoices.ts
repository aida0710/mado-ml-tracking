import type { Artifact } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { parseArtifactReference } from '../lib/artifactReference';
import { useProjectArtifacts } from './useProjectArtifacts';
import { useQuery } from './useQuery';
import { useSettledValue } from './useSettledValue';

// パスの検索は入力が止まってから始め、キーを押すたびにArtifactを一覧し直さないようにする。
export const ARTIFACT_SEARCH_DELAY_MS = 300;

/**
 * ピッカーに入力した内容に対して出すArtifact。貼り付けたidや`artifact://<id>`は直接引く
 * （`referenced`。ProjectにそのArtifactが無ければ`referenceMissing`も付く）。それ以外は保存された
 * パスを検索し、Runを渡したときは`runId`のファイルの中から探す。
 */
export function useArtifactChoices({
  projectId,
  runId,
  input,
}: {
  projectId: string;
  runId?: string;
  input: string;
}) {
  const referenceId = parseArtifactReference(input);
  const { settled: search, isSettling } = useSettledValue(
    referenceId ? '' : input.trim(),
    ARTIFACT_SEARCH_DELAY_MS,
  );
  const listing = useProjectArtifacts({ projectId, enabled: !referenceId, search, runId });
  const referenced = useQuery<Artifact | null>({
    key: referenceId ? `${projectId}:artifact:${referenceId}` : null,
    load: (signal) => trackingApi.findArtifact(projectId, referenceId!, signal),
  });
  if (referenceId)
    return {
      referenceId,
      artifacts: referenced.value ? [referenced.value] : [],
      loading: referenced.loading,
      referenceMissing: referenced.value === null,
      error: referenced.error,
      hasSearch: true,
      reload: referenced.reload,
    };
  return {
    referenceId: null,
    artifacts: isSettling ? [] : listing.items,
    loading: isSettling || listing.loading,
    referenceMissing: false,
    error: listing.error,
    hasSearch: search !== '',
    reload: listing.reload,
  };
}
