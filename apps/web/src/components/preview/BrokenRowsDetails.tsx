import type { EvaluationSampleError } from '../../lib/evaluationSamples';
import { text } from '../../i18n/catalog';
import { artifactsTextTemplates, evaluationSampleErrorLabels } from '../../i18n/artifacts';

// Only the first errors are listed; the count beside the table still covers every broken row.
const LISTED_ERROR_LIMIT = 20;

/** The rows a table preview could not read, by line and reason, folded under 「読み取れない行」. */
export function BrokenRowsDetails({ errors }: { errors: readonly EvaluationSampleError[] }) {
  if (errors.length === 0) return null;
  return (
    <details className="evaluation-errors">
      <summary>{text.evaluationBrokenRows}</summary>
      <ul>
        {errors.slice(0, LISTED_ERROR_LIMIT).map((error) => (
          <li key={error.line}>
            {artifactsTextTemplates.evaluationLine(error.line)}: {evaluationSampleErrorLabels[error.reason]}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** 「読み取れない行 N件」 for a table toolbar; nothing when every row was read. */
export function BrokenRowCount({ errors }: { errors: readonly EvaluationSampleError[] }) {
  if (errors.length === 0) return null;
  return <span className="sample-error">{artifactsTextTemplates.evaluationBrokenRowCount(errors.length)}</span>;
}
