import { useLocale } from '../../i18n/useLocale';
import { useMemo, type ReactNode } from 'react';
import { MEDIA_COMPARE_MAX_STEPS } from '@mmt/contracts';
import { stepCoverage, withStepToggled } from '../../lib/mediaCompareSteps';
import { textTemplates } from '../../i18n/catalog';

/**
 * The steps the compared Runs recorded, as checkboxes, so only logged steps can be chosen. A step
 * that not every Run recorded says how many did, since its column will have empty cells. Used by
 * the Compare page's media tab and by the report's media embed.
 */
export function MediaStepChecklist({
  legend,
  stepsByRun,
  selected,
  onChange,
  actions,
  hint,
}: {
  legend: string;
  /** The steps each compared Run recorded for the key. */
  stepsByRun: readonly (readonly number[])[];
  selected: readonly number[];
  onChange: (steps: number[]) => void;
  /** Shortcut buttons shown above the checkboxes. */
  actions?: ReactNode;
  /** What an empty choice means, read with the group. */
  hint?: string;
}) {
  useLocale();
  const coverage = useMemo(() => stepCoverage(stepsByRun), [stepsByRun]);
  const recordingRunCount = stepsByRun.filter((steps) => steps.length > 0).length;
  const isFull = selected.length >= MEDIA_COMPARE_MAX_STEPS;
  return (
    <fieldset className="media-step-checklist">
      <legend>{legend}</legend>
      {actions && <div className="media-step-checklist-actions">{actions}</div>}
      <div className="media-step-checklist-options">
        {coverage.map(({ step, runCount }) => {
          const isChecked = selected.includes(step);
          return (
            <label key={step} className="checkbox-field">
              <input
                type="checkbox"
                checked={isChecked}
                disabled={!isChecked && isFull}
                onChange={() => onChange(withStepToggled(selected, step))}
              />
              <span className="mono">{step}</span>
              {runCount < recordingRunCount && (
                <span className="muted media-step-coverage">{textTemplates.mediaStepRunCoverage(runCount, recordingRunCount)}</span>
              )}
            </label>
          );
        })}
      </div>
      {hint && <small className="muted">{hint}</small>}
      {isFull && <small className="muted">{textTemplates.mediaCompareTooManySteps(MEDIA_COMPARE_MAX_STEPS)}</small>}
    </fieldset>
  );
}
