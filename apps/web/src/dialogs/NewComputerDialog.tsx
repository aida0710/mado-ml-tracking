import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PlugZap } from 'lucide-react';
import type {
  AuthConfig,
  ComputeTargetDetails,
  ComputeTargetExecutor,
  Launcher,
} from '@mmt/contracts';
import { useCheckWorkerChoice } from '../hooks/useCheckWorkerChoice';
import { useNewComputerSteps } from '../hooks/useNewComputerSteps';
import { useTargetDirectoryListings } from '../hooks/useTargetDirectoryListings';
import { useTargetForm } from '../hooks/useTargetForm';
import { useTargetPathSuggestions } from '../hooks/useTargetPathSuggestions';
import { ComputerConnectionFields } from '../components/ComputerConnectionFields';
import { ComputerKindPicker } from '../components/ComputerKindPicker';
import { ComputerSetupFields } from '../components/ComputerSetupFields';
import { Dialog } from '../components/Dialog';
import { ErrorNotice } from '../components/Feedback';
import { TargetCheckStatus } from '../components/TargetCheckStatus';
import { TargetFields } from '../components/TargetFields';
import { isConnectionReached } from '../lib/computerSetupValues';
import { getFieldValue } from '../lib/formValues';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

// What the step 1 buttons ask for; both check the form's required fields first.
type ConnectionIntent = 'check' | 'skip';

/**
 * A global administrator adds a computer. An ssh or local computer is added in two steps: 1「接続」
 * saves how a worker reaches it (disabled) and asks the chosen worker to check it, and 2「接続後の
 * 設定」fills its work directory, Python, CPU, runtimes and GPUs in from the check. A site is added
 * in one form, as before.
 */
export function NewComputerDialog({
  auth,
  launchers,
  onClose,
  onSaved,
}: {
  auth: AuthConfig;
  launchers: Launcher[];
  onClose: () => void;
  onSaved: (target: ComputeTargetDetails) => void;
}) {
  useLocale();
  const form = useTargetForm({ canAddSshOrLocal: true });
  const choice = useCheckWorkerChoice(null);
  const steps = useNewComputerSteps({
    values: form.values,
    changeValues: form.changeValues,
    worker: choice.worker,
  });
  const listings = useTargetDirectoryListings({
    targetId: steps.saved?.id ?? null,
    worker: choice.worker,
  });
  const paths = useTargetPathSuggestions({ check: steps.check.latestFinished, listings });
  const [concurrencyFollowsGpus, setConcurrencyFollowsGpus] = useState(true);
  // The step's form, so a new step starts at the top of the dialog instead of where the last ended.
  const stepForm = useRef<HTMLFormElement>(null);
  useEffect(() => {
    stepForm.current?.closest('dialog')?.scrollTo({ top: 0 });
  }, [steps.step]);
  const executor = getFieldValue(form.values, 'executor') as ComputeTargetExecutor;
  const pending = form.pending || steps.pending;
  const kinds: ComputeTargetExecutor[] =
    auth.mode === 'development' ? ['ssh', 'local', 'site'] : ['ssh', 'site'];
  const kindPicker = (
    <ComputerKindPicker
      kinds={kinds}
      value={executor}
      onChange={(kind) => form.changeValues({ ...form.values, executor: kind })}
      // Saved by step 1: it stays the kind it was saved as.
      disabled={steps.saved !== null}
    />
  );
  const finish = (saved: ComputeTargetDetails | undefined) => {
    if (saved) onSaved(saved);
  };

  if (executor === 'site')
    return (
      <Dialog title={text.newTarget} onClose={onClose} busy={pending} wide>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.save().then(finish);
          }}
        >
          <fieldset disabled={pending}>
            <TargetFields
              values={form.values}
              onChange={form.changeValues}
              canAddSshOrLocal={false}
              allowLocal={false}
              launchers={launchers}
              kindPicker={kindPicker}
            />
          </fieldset>
          <ErrorNotice message={form.error} />
          <footer>
            <button type="button" className="button" onClick={onClose} disabled={pending}>
              {text.cancel}
            </button>
            <button className="button primary" disabled={pending}>
              {pending ? text.loading : text.save}
            </button>
          </footer>
        </form>
      </Dialog>
    );

  const submitConnection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const intent = submitter?.dataset.intent as ConnectionIntent | undefined;
    void (intent === 'check' ? steps.checkAndContinue() : steps.continueWithoutCheck());
  };
  const submitSetup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void steps.saveSetup().then(finish);
  };
  const isChecking = steps.isWaitingForCheck || steps.check.isInProgress;
  // A check of the saved connection ended without reaching the computer.
  const hasFailedCheck =
    steps.saved !== null &&
    !isChecking &&
    steps.check.latest !== undefined &&
    !isConnectionReached(steps.check.latest);
  const setupNote = steps.isFilledFromCheck
    ? text.setupFromCheck
    : steps.check.latestFinished
      ? null
      : text.setupWithoutCheck;
  const wizardSteps = (
    <ol className="wizard-steps">
      {[text.setupStepConnection, text.setupStepSettings].map((label, index) => {
        const isActive = (index === 0) === (steps.step === 'connection');
        return (
          <li
            key={label}
            className={isActive ? 'active' : ''}
            aria-current={isActive ? 'step' : undefined}
          >
            {index + 1}. {label}
          </li>
        );
      })}
    </ol>
  );
  return (
    <Dialog title={text.newTarget} onClose={onClose} busy={pending} wide>
      {steps.step === 'connection' ? (
        <form ref={stepForm} onSubmit={submitConnection} data-testid="computer-connection-step">
          {wizardSteps}
          <fieldset disabled={pending || isChecking}>
            <ComputerConnectionFields
              values={form.values}
              onChange={form.changeValues}
              kindPicker={kindPicker}
              workers={choice.workers.value ?? []}
              worker={choice.worker}
              onWorkerChange={choice.choose}
              onReloadWorkers={choice.workers.reload}
            />
          </fieldset>
          {steps.saved && <TargetCheckStatus check={steps.check.latest} executor={executor} />}
          {hasFailedCheck && <p className="field-hint">{text.checkFailedNext}</p>}
          <ErrorNotice message={steps.error} />
          <footer>
            <button type="button" className="button" onClick={onClose} disabled={pending}>
              {text.cancel}
            </button>
            <button className="button" data-intent="skip" disabled={pending}>
              {text.continueWithoutCheck}
            </button>
            <button
              className="button primary"
              data-intent="check"
              disabled={pending || isChecking || !choice.worker}
            >
              <PlugZap size={15} />
              {isChecking ? text.checkRunning : text.checkAndContinue}
            </button>
          </footer>
        </form>
      ) : (
        <form ref={stepForm} onSubmit={submitSetup} data-testid="computer-setup-step">
          {wizardSteps}
          <div className="target-check-bar">
            <TargetCheckStatus check={steps.check.latest} executor={executor} />
            <button
              type="button"
              className="button"
              onClick={steps.recheck}
              disabled={pending || steps.check.isInProgress || !choice.worker}
            >
              <PlugZap size={15} />
              {text.recheck}
            </button>
          </div>
          {setupNote && <p className="muted">{setupNote}</p>}
          <fieldset disabled={pending}>
            <ComputerSetupFields
              values={form.values}
              onChange={form.changeValues}
              result={steps.check.latestFinished?.result}
              suggestWorkDirectory={paths.suggestWorkDirectory}
              suggestPython={paths.suggestPython}
              suggestionsRefreshKey={paths.refreshKey}
              concurrencyFollowsGpus={concurrencyFollowsGpus}
              onConcurrencyEdited={() => setConcurrencyFollowsGpus(false)}
            />
          </fieldset>
          <ErrorNotice message={steps.error} />
          <footer>
            <button
              type="button"
              className="button"
              onClick={steps.backToConnection}
              disabled={pending}
            >
              {text.back}
            </button>
            <button className="button primary" disabled={pending}>
              {pending ? text.loading : text.save}
            </button>
          </footer>
        </form>
      )}
    </Dialog>
  );
}
