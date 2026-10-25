import { useState } from 'react';
import type { ModelVersion } from '@mmt/contracts';
import {
  baselineVersionIdOf,
  defaultBaselineChoice,
  isBaselineChoiceAvailable,
  type BaselineChoice,
} from '../lib/evaluationBaseline';

/**
 * バージョンのページが比べる基準バージョン。メトリクスの要約と比較のパネルが共有する。選んだ
 * aliasが消えたか、そのバージョンが無くなったときは、既定の基準バージョンに戻る。
 */
export function useEvaluationBaseline(model: {
  aliases: Record<string, string>;
  candidateVersionId: string;
  versions: readonly ModelVersion[];
}) {
  const [chosen, setChosen] = useState<BaselineChoice | null>(null);
  const isDefault = !chosen || !isBaselineChoiceAvailable(chosen, model);
  const choice = isDefault ? defaultBaselineChoice(model) : chosen;
  return {
    choice,
    isDefault,
    versionId: baselineVersionIdOf(choice, model.aliases),
    select: setChosen,
  };
}

export type EvaluationBaseline = ReturnType<typeof useEvaluationBaseline>;
