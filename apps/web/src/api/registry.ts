import type {
  Code,
  CodeVersion,
  CodeVersionDetail,
  Dataset,
  DatasetUpdate,
  DatasetVersion,
  Model,
  ModelAliasEventPage,
  ModelAliasProtection,
  ModelAliasProtectionRole,
  ModelFamilySummary,
  ModelVersion,
  ModelVersionDetail,
  ModelVersionEvaluationSummary,
  ModelVersionResultRunKind,
  RunDownstreamPage,
} from '@mmt/contracts';
import type { CreateCodeVersion, CreateDatasetVersion, CreateModelVersion } from './inputs';
import {
  assertCursorPage,
  encodeId,
  jsonRequest,
  projectPath,
  request,
  requestItems,
} from './http';

// サーバーが拒む入力をフォームで止めるため、APIの上限に合わせる。
export const MAX_MODEL_ALIAS_REASON_LENGTH = 2000;
// 続きを読むたびにサーバーの1ページを取るよう、APIの既定値に合わせる。
export const MODEL_ALIAS_EVENT_PAGE_SIZE = 50;
// APIの最大値。バージョンの画面は、バージョンの結果をポーリングで読む1ページで見せる。
export const MODEL_VERSION_RUN_PAGE_SIZE = 200;
// Runから始まったRunを読むときの、APIの既定値に合わせる。
export const RUN_DOWNSTREAM_PAGE_SIZE = 50;

export interface ModelAliasAssignment {
  alias: string;
  versionId: string;
  /** 空は理由なしを表す。APIは''として保存する。 */
  reason: string;
  /** このaliasとバージョンについて合格した昇格の判定。変更の根拠として送る。 */
  evaluationId?: string;
}

/** 1つの保護。modelIdがnullなら、Projectのすべてのモデルのそのaliasを保護する。 */
export interface ModelAliasProtectionTarget {
  alias: string;
  modelId: string | null;
}

const aliasProtectionPath = (projectId: string, target: ModelAliasProtectionTarget) =>
  `${projectPath(projectId)}/alias-protections/${encodeId(target.alias)}${
    target.modelId ? `?${new URLSearchParams({ modelId: target.modelId })}` : ''
  }`;

const registryPath = (projectId: string, registry: string, id?: string) =>
  `${projectPath(projectId)}/${registry}${id ? `/${encodeId(id)}` : ''}`;
export const registryApi = {
  models: (projectId: string, signal?: AbortSignal) =>
    requestItems<Model>(registryPath(projectId, 'models'), signal),
  createModel: (projectId: string, body: { name: string; family: string; description?: string }) =>
    request<Model>(registryPath(projectId, 'models'), jsonRequest('POST', body)),
  // Projectのモデルとコードバージョンが使うモデル系列。大文字・小文字だけが違うものは隣に並べる。
  modelFamilies: (projectId: string, signal?: AbortSignal) =>
    requestItems<ModelFamilySummary>(registryPath(projectId, 'model-families'), signal),
  modelVersions: (projectId: string, id: string, signal?: AbortSignal) =>
    requestItems<ModelVersion>(`${registryPath(projectId, 'models', id)}/versions`, signal),
  createModelVersion: (projectId: string, id: string, body: CreateModelVersion) =>
    request<ModelVersion>(
      `${registryPath(projectId, 'models', id)}/versions`,
      jsonRequest('POST', body),
    ),
  assignAlias: (projectId: string, id: string, assignment: ModelAliasAssignment) =>
    request<Model>(
      `${registryPath(projectId, 'models', id)}/aliases/${encodeId(assignment.alias)}`,
      jsonRequest('PUT', {
        versionId: assignment.versionId,
        ...(assignment.reason ? { reason: assignment.reason } : {}),
        ...(assignment.evaluationId ? { evaluationId: assignment.evaluationId } : {}),
      }),
    ),
  // modelIdなしならProject全体の保護だけ、ありならそのモデル自身の保護も返す。
  aliasProtections: (projectId: string, modelId: string | null, signal?: AbortSignal) =>
    requestItems<ModelAliasProtection>(
      `${projectPath(projectId)}/alias-protections${
        modelId ? `?${new URLSearchParams({ modelId })}` : ''
      }`,
      signal,
    ),
  setAliasProtection: (
    projectId: string,
    protection: ModelAliasProtectionTarget & {
      requiredRole: ModelAliasProtectionRole;
      requirePassedEvaluation: boolean;
    },
  ) =>
    request<ModelAliasProtection>(
      aliasProtectionPath(projectId, protection),
      jsonRequest('PUT', {
        requiredRole: protection.requiredRole,
        requirePassedEvaluation: protection.requirePassedEvaluation,
      }),
    ),
  removeAliasProtection: (projectId: string, target: ModelAliasProtectionTarget) =>
    request<void>(aliasProtectionPath(projectId, target), { method: 'DELETE' }),
  removeAlias: (projectId: string, id: string, alias: string) =>
    request<void>(`${registryPath(projectId, 'models', id)}/aliases/${encodeId(alias)}`, {
      method: 'DELETE',
    }),
  aliasEvents: async (
    projectId: string,
    id: string,
    { cursor, signal }: { cursor?: string; signal?: AbortSignal } = {},
  ): Promise<ModelAliasEventPage> => {
    const query = new URLSearchParams({ limit: String(MODEL_ALIAS_EVENT_PAGE_SIZE) });
    if (cursor) query.set('cursor', cursor);
    const page = await request<ModelAliasEventPage>(
      `${registryPath(projectId, 'models', id)}/alias-events?${query}`,
      { signal },
    );
    assertCursorPage(page);
    return page;
  },
  modelVersionDetail: (projectId: string, versionId: string, signal?: AbortSignal) =>
    request<ModelVersionDetail>(registryPath(projectId, 'model-versions', versionId), { signal }),
  modelVersionEvaluations: async (
    projectId: string,
    versionId: string,
    { kind, signal }: { kind?: ModelVersionResultRunKind; signal?: AbortSignal } = {},
  ): Promise<ModelVersionEvaluationSummary> => {
    const query = new URLSearchParams({ limit: String(MODEL_VERSION_RUN_PAGE_SIZE) });
    if (kind) query.set('kind', kind);
    const page = await request<ModelVersionEvaluationSummary>(
      `${registryPath(projectId, 'model-versions', versionId)}/evaluations?${query}`,
      { signal },
    );
    assertCursorPage(page);
    return page;
  },
  runDownstream: async (
    projectId: string,
    runId: string,
    { cursor, signal }: { cursor?: string; signal?: AbortSignal } = {},
  ): Promise<RunDownstreamPage> => {
    const query = new URLSearchParams({ limit: String(RUN_DOWNSTREAM_PAGE_SIZE) });
    if (cursor) query.set('cursor', cursor);
    const page = await request<RunDownstreamPage>(
      `${projectPath(projectId)}/runs/${encodeId(runId)}/downstream?${query}`,
      { signal },
    );
    assertCursorPage(page);
    return page;
  },
  codes: (projectId: string, signal?: AbortSignal) =>
    requestItems<Code>(registryPath(projectId, 'codes'), signal),
  createCode: (projectId: string, body: { name: string; description?: string }) =>
    request<Code>(registryPath(projectId, 'codes'), jsonRequest('POST', body)),
  codeVersions: (projectId: string, id: string, signal?: AbortSignal) =>
    requestItems<CodeVersion>(`${registryPath(projectId, 'codes', id)}/versions`, signal),
  /** Projectのコードとそのすべてのバージョン。コードごとに並行して読む。 */
  codesWithVersions: async (projectId: string, signal?: AbortSignal) => {
    const codes = await registryApi.codes(projectId, signal);
    const versions = await Promise.all(
      codes.map((code) => registryApi.codeVersions(projectId, code.id, signal)),
    );
    return { codes, codeVersions: versions.flat() };
  },
  codeVersionDetail: (projectId: string, versionId: string, signal?: AbortSignal) =>
    request<CodeVersionDetail>(registryPath(projectId, 'code-versions', versionId), { signal }),
  createCodeVersion: (projectId: string, id: string, body: CreateCodeVersion) =>
    request<CodeVersion>(
      `${registryPath(projectId, 'codes', id)}/versions`,
      jsonRequest('POST', body),
    ),
  datasets: (projectId: string, signal?: AbortSignal) =>
    requestItems<Dataset>(registryPath(projectId, 'datasets'), signal),
  createDataset: (
    projectId: string,
    body: { name: string; namespace?: string; description?: string },
  ) => request<Dataset>(registryPath(projectId, 'datasets'), jsonRequest('POST', body)),
  /** 説明とアーカイブ。名前は変えられない（SDKやMLflowは名前でデータセットを探す）。 */
  updateDataset: (projectId: string, id: string, body: DatasetUpdate) =>
    request<Dataset>(registryPath(projectId, 'datasets', id), jsonRequest('PATCH', body)),
  datasetVersions: (projectId: string, id: string, signal?: AbortSignal) =>
    requestItems<DatasetVersion>(`${registryPath(projectId, 'datasets', id)}/versions`, signal),
  createDatasetVersion: (projectId: string, id: string, body: CreateDatasetVersion) =>
    request<DatasetVersion>(
      `${registryPath(projectId, 'datasets', id)}/versions`,
      jsonRequest('POST', body),
    ),
  /** 何かがそのバージョンを参照している間は、409 dataset_version_in_useで拒まれる。 */
  deleteDatasetVersion: (projectId: string, version: { datasetId: string; versionId: string }) =>
    request<unknown>(
      `${registryPath(projectId, 'datasets', version.datasetId)}/versions/${encodeId(version.versionId)}`,
      { method: 'DELETE' },
    ),
};
