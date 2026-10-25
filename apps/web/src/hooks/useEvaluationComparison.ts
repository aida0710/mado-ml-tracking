import { evaluationApi } from '../api/evaluation';
import { encodeBaselineChoice, type BaselineChoice } from '../lib/evaluationBaseline';
import { useQuery } from './useQuery';

/** バージョンと、選んだ基準バージョンとの比較。選択がnullなら、APIがproductionを使う。 */
export function useEvaluationComparison(target: {
  projectId: string;
  modelId: string;
  candidateVersionId: string;
  baseline: BaselineChoice | null;
}) {
  const { projectId, modelId, candidateVersionId, baseline } = target;
  const comparison = useQuery({
    key: `${projectId}:${modelId}:${candidateVersionId}:evaluation-comparison:${encodeBaselineChoice(baseline)}`,
    load: (signal) =>
      evaluationApi.comparison(
        { projectId, modelId, candidateVersionId },
        baseline?.kind === 'version'
          ? { baselineVersionId: baseline.versionId }
          : { baselineAlias: baseline?.alias },
        signal,
      ),
  });
  return { comparison };
}
