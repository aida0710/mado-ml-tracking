import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { DatasetUpdate, ModelAliasProtectionRole, ModelVersionResultRunKind } from '@mmt/contracts';
import {
  codeSchema,
  codeVersionDetailSchema,
  codeVersionSchema,
  datasetSchema,
  datasetVersionSchema,
  itemsOf,
  modelAliasEventPageSchema,
  modelAliasProtectionSchema,
  modelFamilySummarySchema,
  modelSchema,
  modelVersionDetailSchema,
  modelVersionEvaluationSummarySchema,
  modelVersionSchema,
  runDownstreamPageSchema,
} from '@mmt/contracts/schemas';
import { z } from 'zod';
import type { CreateCodeVersion, CreateDatasetVersion, CreateModelVersion } from './inputs';
import { encodeId, projectPath } from './http';

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
  models: async (projectId: string, signal?: AbortSignal) =>
    (await requestJson(registryPath(projectId, 'models'), { schema: itemsOf(modelSchema), init: { signal } })).items,
  createModel: (projectId: string, body: { name: string; family: string; description?: string }) =>
    requestJson(registryPath(projectId, 'models'), { schema: modelSchema, init: jsonRequestInit('POST', body) }),
  // Projectのモデルとコードバージョンが使うモデル系列。大文字・小文字だけが違うものは隣に並べる。
  modelFamilies: async (projectId: string, signal?: AbortSignal) =>
    (
      await requestJson(registryPath(projectId, 'model-families'), {
        schema: itemsOf(modelFamilySummarySchema),
        init: { signal },
      })
    ).items,
  modelVersions: async (projectId: string, id: string, signal?: AbortSignal) =>
    (
      await requestJson(`${registryPath(projectId, 'models', id)}/versions`, {
        schema: itemsOf(modelVersionSchema),
        init: { signal },
      })
    ).items,
  createModelVersion: (projectId: string, id: string, body: CreateModelVersion) =>
    requestJson(`${registryPath(projectId, 'models', id)}/versions`, {
      schema: modelVersionSchema,
      init: jsonRequestInit('POST', body),
    }),
  assignAlias: (projectId: string, id: string, assignment: ModelAliasAssignment) =>
    requestJson(`${registryPath(projectId, 'models', id)}/aliases/${encodeId(assignment.alias)}`, {
      schema: modelSchema,
      init: jsonRequestInit('PUT', {
        versionId: assignment.versionId,
        ...(assignment.reason ? { reason: assignment.reason } : {}),
        ...(assignment.evaluationId ? { evaluationId: assignment.evaluationId } : {}),
      }),
    }),
  // modelIdなしならProject全体の保護だけ、ありならそのモデル自身の保護も返す。
  aliasProtections: async (projectId: string, modelId: string | null, signal?: AbortSignal) =>
    (
      await requestJson(
        `${projectPath(projectId)}/alias-protections${modelId ? `?${new URLSearchParams({ modelId })}` : ''}`,
        { schema: itemsOf(modelAliasProtectionSchema), init: { signal } },
      )
    ).items,
  setAliasProtection: (
    projectId: string,
    protection: ModelAliasProtectionTarget & {
      requiredRole: ModelAliasProtectionRole;
      requirePassedEvaluation: boolean;
    },
  ) =>
    requestJson(aliasProtectionPath(projectId, protection), {
      schema: modelAliasProtectionSchema,
      init: jsonRequestInit('PUT', {
        requiredRole: protection.requiredRole,
        requirePassedEvaluation: protection.requirePassedEvaluation,
      }),
    }),
  removeAliasProtection: (projectId: string, target: ModelAliasProtectionTarget) =>
    requestJson(aliasProtectionPath(projectId, target), { schema: z.undefined(), init: { method: 'DELETE' } }),
  removeAlias: (projectId: string, id: string, alias: string) =>
    requestJson(`${registryPath(projectId, 'models', id)}/aliases/${encodeId(alias)}`, {
      schema: z.undefined(),
      init: { method: 'DELETE' },
    }),
  aliasEvents: (
    projectId: string,
    id: string,
    { cursor, signal }: { cursor?: string; signal?: AbortSignal } = {},
  ) => {
    const query = new URLSearchParams({ limit: String(MODEL_ALIAS_EVENT_PAGE_SIZE) });
    if (cursor) query.set('cursor', cursor);
    return requestJson(`${registryPath(projectId, 'models', id)}/alias-events?${query}`, {
      schema: modelAliasEventPageSchema,
      init: { signal },
    });
  },
  modelVersionDetail: (projectId: string, versionId: string, signal?: AbortSignal) =>
    requestJson(registryPath(projectId, 'model-versions', versionId), {
      schema: modelVersionDetailSchema,
      init: { signal },
    }),
  modelVersionEvaluations: (
    projectId: string,
    versionId: string,
    { kind, signal }: { kind?: ModelVersionResultRunKind; signal?: AbortSignal } = {},
  ) => {
    const query = new URLSearchParams({ limit: String(MODEL_VERSION_RUN_PAGE_SIZE) });
    if (kind) query.set('kind', kind);
    return requestJson(`${registryPath(projectId, 'model-versions', versionId)}/evaluations?${query}`, {
      schema: modelVersionEvaluationSummarySchema,
      init: { signal },
    });
  },
  runDownstream: (
    projectId: string,
    runId: string,
    { cursor, signal }: { cursor?: string; signal?: AbortSignal } = {},
  ) => {
    const query = new URLSearchParams({ limit: String(RUN_DOWNSTREAM_PAGE_SIZE) });
    if (cursor) query.set('cursor', cursor);
    return requestJson(`${projectPath(projectId)}/runs/${encodeId(runId)}/downstream?${query}`, {
      schema: runDownstreamPageSchema,
      init: { signal },
    });
  },
  codes: async (projectId: string, signal?: AbortSignal) =>
    (await requestJson(registryPath(projectId, 'codes'), { schema: itemsOf(codeSchema), init: { signal } })).items,
  createCode: (projectId: string, body: { name: string; description?: string }) =>
    requestJson(registryPath(projectId, 'codes'), { schema: codeSchema, init: jsonRequestInit('POST', body) }),
  codeVersions: async (projectId: string, id: string, signal?: AbortSignal) =>
    (
      await requestJson(`${registryPath(projectId, 'codes', id)}/versions`, {
        schema: itemsOf(codeVersionSchema),
        init: { signal },
      })
    ).items,
  /** Projectのコードとそのすべてのバージョン。コードごとに並行して読む。 */
  codesWithVersions: async (projectId: string, signal?: AbortSignal) => {
    const codes = await registryApi.codes(projectId, signal);
    const versions = await Promise.all(
      codes.map((code) => registryApi.codeVersions(projectId, code.id, signal)),
    );
    return { codes, codeVersions: versions.flat() };
  },
  codeVersionDetail: (projectId: string, versionId: string, signal?: AbortSignal) =>
    requestJson(registryPath(projectId, 'code-versions', versionId), {
      schema: codeVersionDetailSchema,
      init: { signal },
    }),
  createCodeVersion: (projectId: string, id: string, body: CreateCodeVersion) =>
    requestJson(`${registryPath(projectId, 'codes', id)}/versions`, {
      schema: codeVersionSchema,
      init: jsonRequestInit('POST', body),
    }),
  datasets: async (projectId: string, signal?: AbortSignal) =>
    (await requestJson(registryPath(projectId, 'datasets'), { schema: itemsOf(datasetSchema), init: { signal } }))
      .items,
  createDataset: (
    projectId: string,
    body: { name: string; namespace?: string; description?: string },
  ) => requestJson(registryPath(projectId, 'datasets'), { schema: datasetSchema, init: jsonRequestInit('POST', body) }),
  /** 説明とアーカイブ。名前は変えられない（SDKやMLflowは名前でデータセットを探す）。 */
  updateDataset: (projectId: string, id: string, body: DatasetUpdate) =>
    requestJson(registryPath(projectId, 'datasets', id), { schema: datasetSchema, init: jsonRequestInit('PATCH', body) }),
  datasetVersions: async (projectId: string, id: string, signal?: AbortSignal) =>
    (
      await requestJson(`${registryPath(projectId, 'datasets', id)}/versions`, {
        schema: itemsOf(datasetVersionSchema),
        init: { signal },
      })
    ).items,
  createDatasetVersion: (projectId: string, id: string, body: CreateDatasetVersion) =>
    requestJson(`${registryPath(projectId, 'datasets', id)}/versions`, {
      schema: datasetVersionSchema,
      init: jsonRequestInit('POST', body),
    }),
  /** 何かがそのバージョンを参照している間は、409 dataset_version_in_useで拒まれる。 */
  deleteDatasetVersion: (projectId: string, version: { datasetId: string; versionId: string }) =>
    requestJson(
      `${registryPath(projectId, 'datasets', version.datasetId)}/versions/${encodeId(version.versionId)}`,
      { schema: z.undefined(), init: { method: 'DELETE' } },
    ),
};
