import type { ChoiceOption } from '../ChoiceField';
import { workflowsTextTemplates } from '../../i18n/workflows';
import { useLocale } from '../../i18n/useLocale';

/**
 * Says that a step refers to an earlier step key that is no longer there (the step was removed,
 * moved below, or its key cleared), so the empty choice is not taken for "none".
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
