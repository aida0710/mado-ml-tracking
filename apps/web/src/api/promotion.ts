import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { PromotionPolicyCreate } from '@mmt/contracts';
import {
  itemsOf,
  promotionEvaluationPageSchema,
  promotionEvaluationSchema,
  promotionPolicySchema,
} from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

// 続きを読むたびにサーバーの1ページを取る。APIはlimitを200までに抑える。
export const PROMOTION_EVALUATION_PAGE_SIZE = 50;

const policiesPath = (projectId: string) => `${projectPath(projectId)}/promotion-policies`;
const evaluationsPath = (projectId: string) => `${projectPath(projectId)}/promotion-evaluations`;

export const promotionApi = {
  policies: async (projectId: string, signal?: AbortSignal) =>
    (await requestJson(policiesPath(projectId), { schema: itemsOf(promotionPolicySchema), init: { signal } })).items,
  createPolicy: (projectId: string, body: PromotionPolicyCreate) =>
    requestJson(policiesPath(projectId), { schema: promotionPolicySchema, init: jsonRequestInit('POST', body) }),
  setPolicyEnabled: (projectId: string, policyId: string, enabled: boolean) =>
    requestJson(`${policiesPath(projectId)}/${encodeId(policyId)}`, {
      schema: promotionPolicySchema,
      init: jsonRequestInit('PATCH', { enabled }),
    }),
  // 昇格policy、候補のバージョン（バージョンの画面）、またはその両方で絞り込む。
  evaluations: (
    projectId: string,
    {
      policyId,
      candidateVersionId,
      cursor,
      signal,
    }: { policyId?: string; candidateVersionId?: string; cursor?: string; signal?: AbortSignal },
  ) => {
    const query = new URLSearchParams({ limit: String(PROMOTION_EVALUATION_PAGE_SIZE) });
    if (policyId) query.set('policyId', policyId);
    if (candidateVersionId) query.set('candidateVersionId', candidateVersionId);
    if (cursor) query.set('cursor', cursor);
    return requestJson(`${evaluationsPath(projectId)}?${query}`, {
      schema: promotionEvaluationPageSchema,
      init: { signal },
    });
  },
  transferPolicyOwner: (projectId: string, policyId: string, serviceAccountId: string) =>
    requestJson(`${policiesPath(projectId)}/${encodeId(policyId)}/owner`, {
      schema: promotionPolicySchema,
      init: jsonRequestInit('PUT', { serviceAccountId }),
    }),
  reevaluate: (projectId: string, evaluationId: string) =>
    requestJson(`${evaluationsPath(projectId)}/${encodeId(evaluationId)}/reevaluate`, {
      schema: promotionEvaluationSchema,
      init: { method: 'POST' },
    }),
};
