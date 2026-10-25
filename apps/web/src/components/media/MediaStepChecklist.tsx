import { useMemo, type ReactNode } from 'react';
import { MEDIA_COMPARE_MAX_STEPS } from '@mmt/contracts';
import { stepCoverage, withStepToggled } from '../../lib/mediaCompareSteps';
import { useLocale } from '../../i18n/useLocale';
import { textTemplates } from '../../i18n/catalog';

/**
 * 比べるRunが記録したstepをチェックボックスで並べ、記録のあるstepだけを選べるようにする。
 * 全Runが記録したわけではないstepには、いくつのRunが記録したかを添える。その列には空のセルが
 * できるため。Compareの画面のメディアのタブと、レポートのメディアの埋め込みが使う。
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
  /** 比べる各Runが、そのキーで記録したstep。 */
  stepsByRun: readonly (readonly number[])[];
  selected: readonly number[];
  onChange: (steps: number[]) => void;
  /** チェックボックスの上に出す近道のボタン。 */
  actions?: ReactNode;
  /** 何も選ばないときの意味。グループと一緒に読ませる。 */
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
