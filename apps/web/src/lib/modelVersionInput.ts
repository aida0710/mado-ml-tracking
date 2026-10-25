import type { Artifact, RunKind } from '@mmt/contracts';
import type { CreateModelVersion } from '../api/inputs';
import { parseJsonObject } from './formValues';
import { text } from '../i18n/catalog';

/** APIがバージョンの元のRunとして受け付けるRunの種類（modelVersionRegistration.ts）。 */
export const SOURCE_RUN_KINDS: RunKind[] = ['training', 'finetuning'];

/** ［バージョンを作成］のフォームが、入力の途中で持つ内容。 */
export interface ModelVersionDraft {
  /** 空なら、APIがモデルの次の番号を付ける。 */
  version: string;
  sourceRunId: string;
  weightsArtifact: Artifact | null;
  /** 重みを選ぶ欄の検索の文字列。何も選んでいなければ、フォームは保存を断る。 */
  weightsSearch: string;
  weightsUri: string;
  parentVersionIds: string[];
  defaultCodeVersionId: string;
  metadata: string;
}

export const EMPTY_MODEL_VERSION_DRAFT: ModelVersionDraft = {
  version: '',
  sourceRunId: '',
  weightsArtifact: null,
  weightsSearch: '',
  weightsUri: '',
  parentVersionIds: [],
  defaultCodeVersionId: '',
  metadata: '{}',
};

/**
 * 元のRunを替えた下書き。前のRunのファイルから選んだ重みのArtifactは、もう元のRunのものでは
 * ないので外す。Runを持たないもの（アップロードしたもの、貼り付けたid）は残し、Runを選んで
 * いないときはどの選択も残す。
 */
export function withSourceRun(draft: ModelVersionDraft, sourceRunId: string): ModelVersionDraft {
  const picked = draft.weightsArtifact;
  const isFromAnotherRun =
    sourceRunId !== '' && picked?.runId != null && picked.runId !== sourceRunId;
  return {
    ...draft,
    sourceRunId,
    weightsArtifact: isFromAnotherRun ? null : picked,
    weightsSearch: isFromAnotherRun ? '' : draft.weightsSearch,
  };
}

/**
 * 下書きが送る要求。送れないときは、出すメッセージを投げる。JSONオブジェクトでないmetadataや、
 * Artifactを選ばずに残した重みの検索がそれに当たる（保存すると、利用者が探していた重みを黙って
 * 落としてしまう）。
 */
export function buildModelVersionInput(draft: ModelVersionDraft): CreateModelVersion {
  if (!draft.weightsArtifact && draft.weightsSearch.trim())
    throw new Error(text.weightsArtifactUnchosen);
  const version = draft.version.trim();
  const weightsUri = draft.weightsUri.trim();
  return {
    ...(version ? { version } : {}),
    parentModelVersionIds: draft.parentVersionIds,
    ...(draft.sourceRunId ? { sourceRunId: draft.sourceRunId } : {}),
    ...(draft.weightsArtifact ? { artifactId: draft.weightsArtifact.id } : {}),
    ...(weightsUri ? { weightsUri } : {}),
    ...(draft.defaultCodeVersionId ? { defaultCodeVersionId: draft.defaultCodeVersionId } : {}),
    metadata: parseJsonObject(draft.metadata),
  };
}
