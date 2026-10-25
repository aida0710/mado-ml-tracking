import { ChevronLeft, ChevronRight } from 'lucide-react';
import { stepIndexAfterKey } from '../../lib/mediaSteps';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

/**
 * 1つのメディアのキーの、記録のあるstepを順に移動する。rangeの入力はstepの値でなく位置を
 * 動くので、どの止まる場所にもメディアがある。
 */
export function MediaStepSlider({
  steps,
  step,
  onStepChange,
}: {
  /** 記録のあるstep。昇順。 */
  steps: readonly number[];
  step: number;
  onStepChange: (step: number) => void;
}) {
  useLocale();
  const index = Math.max(0, steps.indexOf(step));
  const moveTo = (nextIndex: number) => {
    const next = steps[nextIndex];
    if (next !== undefined && next !== step) onStepChange(next);
  };
  const position = textTemplates.mediaStepPosition(step, index + 1, steps.length);
  return (
    <div className="media-step-slider">
      <button
        type="button"
        className="button small"
        onClick={() => moveTo(index - 1)}
        disabled={index === 0}
        aria-label={text.mediaPreviousStep}
      >
        <ChevronLeft size={14} />
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(0, steps.length - 1)}
        step={1}
        value={index}
        disabled={steps.length < 2}
        aria-label={text.mediaStepSlider}
        aria-valuetext={position}
        onChange={(event) => moveTo(Number(event.target.value))}
        onKeyDown={(event) => {
          const nextIndex = stepIndexAfterKey(steps.length, index, event.key);
          if (nextIndex === null) return;
          // ネイティブのrangeはPageUp/PageDownで範囲の何分の一かずつ動く。決まりを1つにそろえる。
          event.preventDefault();
          moveTo(nextIndex);
        }}
      />
      <button
        type="button"
        className="button small"
        onClick={() => moveTo(index + 1)}
        disabled={index >= steps.length - 1}
        aria-label={text.mediaNextStep}
      >
        <ChevronRight size={14} />
      </button>
      <output className="mono media-step-value" aria-live="polite">
        {position}
      </output>
    </div>
  );
}
