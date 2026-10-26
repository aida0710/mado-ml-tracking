import { requestJson } from '@mado/design-system/http';
import { evaluationComparisonSchema } from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

export interface EvaluationComparisonQuery {
  baselineAlias?: string;
  baselineVersionId?: string;
  // 省いた条件は、APIが候補の最新の評価Runから取る。
  referenceDatasetVersionIds?: string[];
  codeVersionId?: string;
  evaluationRuleId?: string;
  metrics?: string[];
}

function comparisonSearch(query: EvaluationComparisonQuery): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined) continue;
    // 空の配列は空のパラメータとして送る。「参照データセットなし」の意味で、「何でもよい」ではない。
    search.set(name, Array.isArray(value) ? value.join(',') : value);
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export const evaluationApi = {
  comparison: (
    target: { projectId: string; modelId: string; candidateVersionId: string },
    query: EvaluationComparisonQuery,
    signal?: AbortSignal,
  ) =>
    requestJson(
      `${projectPath(target.projectId)}/models/${encodeId(target.modelId)}/versions/${encodeId(
        target.candidateVersionId,
      )}/evaluation-comparison${comparisonSearch(query)}`,
      { schema: evaluationComparisonSchema, init: { signal } },
    ),
};
