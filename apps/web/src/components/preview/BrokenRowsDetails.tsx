import type { EvaluationSampleError } from '../../lib/evaluationSamples';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';
import { artifactsTextTemplates, evaluationSampleErrorLabels } from '../../i18n/artifacts';

// 列挙するのは最初のエラーだけ。表の横の件数は、読めない行をすべて数える。
const LISTED_ERROR_LIMIT = 20;

/** 表のプレビューが読めなかった行を、行番号と理由で並べ、「読み取れない行」の下に畳む。 */
export function BrokenRowsDetails({ errors }: { errors: readonly EvaluationSampleError[] }) {
  useLocale();
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

/** 表の帯に出す「読み取れない行 N件」。全行を読めたときは何も出さない。 */
export function BrokenRowCount({ errors }: { errors: readonly EvaluationSampleError[] }) {
  useLocale();
  if (errors.length === 0) return null;
  return <span className="sample-error">{artifactsTextTemplates.evaluationBrokenRowCount(errors.length)}</span>;
}
