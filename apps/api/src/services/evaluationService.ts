import {
  DEFAULT_BASELINE_ALIAS,
  type EvaluationComparison,
  type EvaluationComparisonStatus,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, type Connection, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import { compareMetrics } from '../domain/evaluationComparison.js';
import { referenceDatasetVersionIds } from '../domain/evaluationInputs.js';
import {
  findLatestEvaluationRun,
  loadEvaluationMetrics,
  type EvaluationRunRecord,
} from '../repositories/evaluationRunRepository.js';
import { assertProjectReferences, assertProjectReference } from '../repositories/registryRepository.js';
import { requireProject } from './accessService.js';

export interface EvaluationComparisonRequest {
  modelId: string;
  candidateVersionId: string;
  baselineAlias?: string;
  baselineVersionId?: string;
  // 省いた条件は、候補の、条件に合う最新の評価Runから取る。
  referenceDatasetVersionIds?: readonly string[];
  codeVersionId?: string | null;
  evaluationRuleId?: string;
  metrics?: readonly string[];
  // 内部の呼び出し元だけが使う（HTTPのパラメーターではない）。最新ではなくこの候補Runを判定する。
  candidateRunId?: string;
}

export class EvaluationService {
  constructor(private readonly database: Database) {}

  async compareToBaseline(
    principal: Principal,
    projectId: string,
    request: EvaluationComparisonRequest,
  ): Promise<EvaluationComparison> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    return compareToBaselineInternal(this.database, projectId, request);
  }
}

async function assertModelVersion(
  connection: Connection,
  version: { projectId: string; modelId: string; id: string },
): Promise<void> {
  const found = await first(
    connection,
    'SELECT id FROM model_versions WHERE id=$1 AND model_id=$2 AND project_id=$3',
    [version.id, version.modelId, version.projectId],
  );
  if (!found) notFound('model version');
}

async function assertAutomationRule(
  connection: Connection,
  rule: { projectId: string; id: string },
): Promise<void> {
  const found = await first(
    connection,
    'SELECT id FROM model_automation_rules WHERE id=$1 AND project_id=$2',
    [rule.id, rule.projectId],
  );
  if (!found) notFound('automation rule');
}

async function validateReferences(
  connection: Connection,
  projectId: string,
  request: EvaluationComparisonRequest,
): Promise<void> {
  if (request.baselineAlias !== undefined && request.baselineVersionId !== undefined)
    throw new DomainError({
      status: 422,
      code: 'invalid_request',
      message: 'specify the baseline with either baselineAlias or baselineVersionId',
    });
  await assertProjectReference(connection, { table: 'models', projectId, id: request.modelId });
  await assertModelVersion(connection, {
    projectId,
    modelId: request.modelId,
    id: request.candidateVersionId,
  });
  if (request.baselineVersionId)
    await assertModelVersion(connection, {
      projectId,
      modelId: request.modelId,
      id: request.baselineVersionId,
    });
  if (request.referenceDatasetVersionIds)
    await assertProjectReferences(connection, {
      table: 'dataset_versions',
      projectId,
      ids: [...request.referenceDatasetVersionIds],
    });
  if (request.codeVersionId)
    await assertProjectReference(connection, {
      table: 'code_versions',
      projectId,
      id: request.codeVersionId,
    });
  if (request.evaluationRuleId)
    await assertAutomationRule(connection, { projectId, id: request.evaluationRuleId });
}

async function resolveBaselineVersionId(
  connection: Connection,
  request: { modelId: string; baselineAlias: string | null; baselineVersionId?: string },
): Promise<string | null> {
  if (request.baselineVersionId) return request.baselineVersionId;
  const alias = await first<{ versionId: string }>(
    connection,
    'SELECT version_id FROM model_aliases WHERE model_id=$1 AND alias=$2',
    [request.modelId, request.baselineAlias],
  );
  return alias?.versionId ?? null;
}

function comparisonStatus(runs: {
  baselineVersionId: string | null;
  candidateRun: EvaluationRunRecord | undefined;
  baselineRun: EvaluationRunRecord | undefined;
}): EvaluationComparisonStatus {
  if (!runs.baselineVersionId) return 'baseline_missing';
  if (!runs.candidateRun) return 'candidate_not_evaluated';
  if (!runs.baselineRun) return 'baseline_not_evaluated';
  return 'ok';
}

/**
 * 候補のバージョンの最新の評価と、ベースラインのバージョンの最新の評価を、同じ条件で比べる。
 * ベースラインや評価が無いことはエラーにせずstatusで知らせ、自動の呼び出し元が判断できるように
 * する（たとえば昇格は、ベースラインが無ければ初回のリリースとして扱う）。権限は呼び出し元が
 * 先に確かめること。promotion-policy-gateは、評価Runが終了状態へ移るトランザクションの中で、
 * principalなしでこれを呼ぶ。
 */
export async function compareToBaselineInternal(
  connection: Connection,
  projectId: string,
  request: EvaluationComparisonRequest,
): Promise<EvaluationComparison> {
  await validateReferences(connection, projectId, request);
  const baselineAlias =
    request.baselineVersionId === undefined
      ? (request.baselineAlias ?? DEFAULT_BASELINE_ALIAS)
      : null;
  const baselineVersionId = await resolveBaselineVersionId(connection, {
    modelId: request.modelId,
    baselineAlias,
    baselineVersionId: request.baselineVersionId,
  });
  const evaluationRuleId = request.evaluationRuleId ?? null;
  const candidateRun = await findLatestEvaluationRun(connection, {
    projectId,
    modelVersionId: request.candidateVersionId,
    referenceDatasetVersionIds: request.referenceDatasetVersionIds,
    codeVersionId: request.codeVersionId,
    producedByRuleId: evaluationRuleId,
    runId: request.candidateRunId,
  });
  const references = request.referenceDatasetVersionIds
    ? [...new Set(request.referenceDatasetVersionIds)].sort()
    : candidateRun
      ? referenceDatasetVersionIds(candidateRun)
      : null;
  const codeVersionId =
    request.codeVersionId !== undefined ? request.codeVersionId : candidateRun?.codeVersionId;
  // 候補の評価が無いときは、呼び出し元がすべての条件を渡したときだけ条件が決まる。
  const conditionsDecided = references !== null && codeVersionId !== undefined;
  const baselineRun =
    baselineVersionId && conditionsDecided
      ? await findLatestEvaluationRun(connection, {
          projectId,
          modelVersionId: baselineVersionId,
          referenceDatasetVersionIds: references,
          codeVersionId,
          producedByRuleId: evaluationRuleId,
        })
      : undefined;
  const loadMetrics = (run: EvaluationRunRecord | undefined) =>
    run
      ? loadEvaluationMetrics(connection, {
          projectId,
          run,
          referenceDatasetVersionIds: references ?? [],
        })
      : null;
  return {
    status: comparisonStatus({ baselineVersionId, candidateRun, baselineRun }),
    modelId: request.modelId,
    candidateVersionId: request.candidateVersionId,
    baselineAlias,
    baselineVersionId,
    candidateRunId: candidateRun?.id ?? null,
    baselineRunId: baselineRun?.id ?? null,
    referenceDatasetVersionIds: references ?? [],
    codeVersionId: codeVersionId ?? null,
    evaluationRuleId,
    metrics: compareMetrics({
      candidate: await loadMetrics(candidateRun),
      baseline: await loadMetrics(baselineRun),
      metricKeys: request.metrics,
    }),
  };
}
