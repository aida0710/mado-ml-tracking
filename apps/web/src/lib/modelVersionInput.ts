import type { Artifact, RunKind } from '@mmt/contracts';
import type { CreateModelVersion } from '../api/inputs';
import { parseJsonObject } from './formValues';
import { text } from '../i18n/catalog';

/** The Run kinds the API takes as a version's source Run (modelVersionRegistration.ts). */
export const SOURCE_RUN_KINDS: RunKind[] = ['training', 'finetuning'];

/** What the［バージョンを作成］form holds while it is filled in. */
export interface ModelVersionDraft {
  /** Empty: the API gives the Model's next number. */
  version: string;
  sourceRunId: string;
  weightsArtifact: Artifact | null;
  /** The weights picker's search text; with nothing picked, the form refuses to save it. */
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
 * The draft with another source Run. A weights Artifact picked from the previous Run's files is
 * dropped, since it no longer comes from the source; one without a Run (an upload, a pasted id)
 * stays, and so does any pick when no Run is chosen.
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
 * The request the draft sends. Throws the message to show when it cannot be sent: metadata that is
 * not a JSON object, or a weights search left without a picked Artifact (saving would quietly
 * drop the weights the person was looking for).
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
