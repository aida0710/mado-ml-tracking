import type { ChoiceOption } from '../ChoiceField';
import { workflowsTextTemplates } from '../../i18n/workflows';
import { useLocale } from '../../i18n/useLocale';

/**
 * ステップが、もう存在しない前のステップのキーを参照していることを伝える（ステップを消したか
 * 下へ動かした、またはキーを空にしたか、参照が追従できない形で名前を変えた）。空の選択を
 * 「なし」と取り違えないようにするため。
 */
export function MissingStepReferenceNotice({
  stepKey,
  earlierSteps,
}: {
  stepKey: string | null;
  earlierSteps: ChoiceOption[];
}) {
  useLocale();
  if (!stepKey || earlierSteps.some((step) => step.value === stepKey)) return null;
  return (
    <p className="notice error" role="status">
      {workflowsTextTemplates.workflowMissingStepReference(stepKey)}
    </p>
  );
}
