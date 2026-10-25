import type { StorageTestResult as StorageTestResultValue } from '@mmt/contracts';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';
import { hasStorageTestPassed } from '../../lib/storageTestResult';

// The API names the steps; names it adds later are shown as sent.
const stepLabels: Record<string, string> = {
  get put() { return text.storageTestStepPut; },
  get get() { return text.storageTestStepGet; },
  get range() { return text.storageTestStepRange; },
  get delete() { return text.storageTestStepDelete; },
};

/**
 * Shows each step of a connection test with OK/NG and the API's short error. A failure leads on
 * to changing the backend (`onEdit`, when the screen may change it).
 */
export function StorageTestResult({
  backendName,
  result,
  onEdit,
}: {
  backendName: string;
  result: StorageTestResultValue;
  onEdit?: () => void;
}) {
  useLocale();
  const passed = hasStorageTestPassed(result);
  return (
    <section className="storage-test-result" aria-live="polite">
      <h3>
        {text.storageTestResult}: {backendName}
      </h3>
      <p className={passed ? 'storage-test-summary ok' : 'storage-test-summary ng'}>
        {passed ? text.storageTestPassed : text.storageTestFailed}
      </p>
      <ol>
        {result.steps.map((step) => (
          <li key={step.name} className={step.ok ? 'ok' : 'ng'}>
            {step.ok ? (
              <CheckCircle2 size={14} aria-hidden="true" />
            ) : (
              <XCircle size={14} aria-hidden="true" />
            )}
            <span className="storage-test-step">{stepLabels[step.name] ?? step.name}</span>
            <strong>{step.ok ? text.storageTestOk : text.storageTestNg}</strong>
            {step.error && <span className="storage-test-error">{step.error}</span>}
          </li>
        ))}
      </ol>
      {!passed && onEdit && (
        <div className="storage-test-fix">
          <p className="muted">{text.storageTestFailedFix}</p>
          <button type="button" className="button small" onClick={onEdit}>
            {text.storageEditAfterFailure}
          </button>
        </div>
      )}
    </section>
  );
}
