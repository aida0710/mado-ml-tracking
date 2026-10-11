import { useLocale } from '../i18n/useLocale';
import { Link } from 'react-router-dom';
import type { ComputeTargetDetails, Job, Run, WorkerPresence } from '@mmt/contracts';
import { FormFields } from './FormFields';
import { CodeRuntimeDetails } from './CodeRuntimeDetails';
import { ErrorNotice } from './Feedback';
import { LaunchReview } from './LaunchReview';
import { LaunchManualSubmissionNotice } from './ManualSubmissionNotice';
import { WorkerMissingNotice } from './WorkerCoverage';
import { useLaunchForm, LAUNCH_STEPS, type LaunchStep } from '../hooks/useLaunchForm';
import type { useLaunch } from '../hooks/useLaunch';
import { buildCatalogOptions } from '../lib/catalogOptions';
import type { ClearedLaunchChoice } from '../lib/launchFormChanges';
import { launchResourceFields, launchSetupFields } from '../lib/launchFormFields';
import { launchRunInput } from '../lib/launchFormValues';
import { isManualSite } from '../lib/manualSubmission';
import { validateTargetRuntime } from '../lib/runtimeValidation';
import { buildJobRequest } from '../lib/siteExecutionInput';
import { jobWorkerCoverage } from '../lib/workerCoverage';
import type { ExecutionCatalog } from '../types/executionCatalog';
import { text } from '../i18n/catalog';
import { workerCoverageText } from '../i18n/workerCoverage';

const clearedChoiceNotices: Record<ClearedLaunchChoice, string> = {
  get codeVersion() { return text.launchClearedCodeVersion; },
  get target() { return text.launchClearedTarget; },
  get gpus() { return text.launchClearedGpus; },
};

const stepLabels: Record<LaunchStep, string> = {
  get setup() { return text.launchSetup; },
  get resources() { return text.launchResources; },
  get review() { return text.launchReview; },
};

/**
 * The launch dialog's form in three steps: what to run, where it runs, and a review. [ジョブを起動]
 * on the review starts the Job (with a new Run, unless `existingRun` is given).
 */
export function LaunchForm({
  projectId,
  existingRun,
  catalog,
  targets,
  workers,
  launch,
  onClose,
  onSaved,
}: {
  projectId: string;
  existingRun: Run | undefined;
  catalog: ExecutionCatalog;
  targets: ComputeTargetDetails[];
  /** The Project's workers; undefined until they load, so no computer is said to lack one. */
  workers: WorkerPresence[] | undefined;
  launch: ReturnType<typeof useLaunch>;
  onClose: () => void;
  onSaved: (job: Job) => void;
}) {
  useLocale();
  const form = useLaunchForm({
    existingRun,
    candidates: {
      codeVersions: catalog.codeVersions,
      modelVersions: catalog.modelVersions,
      targets,
    },
  });
  const { values, choices, step } = form;
  const options = buildCatalogOptions(catalog);
  const coverageOf = (target: ComputeTargetDetails) =>
    workers && jobWorkerCoverage(target, workers);
  const targetCoverage = choices.target && coverageOf(choices.target);

  function validateSetup() {
    if (!choices.selectedCode) throw new Error(text.launchBlocked);
    launchRunInput(values);
  }
  function submit() {
    if (step === 'setup') {
      validateSetup();
      form.goForward();
      return;
    }
    validateTargetRuntime(choices.target, choices.selectedCode);
    if (!choices.target) throw new Error(text.runtimeTargetError);
    const job = buildJobRequest(choices.target, values);
    if (step === 'resources') {
      form.goForward();
      return;
    }
    validateSetup();
    void launch.launch({ run: launchRunInput(values), job }).then((created) => {
      if (created) onSaved(created);
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        form.clearValidationFailure();
        try {
          submit();
        } catch (error) {
          form.setValidationFailure(error);
        }
      }}
    >
      <ol className="wizard-steps">
        {LAUNCH_STEPS.map((key, index) => (
          <li
            key={key}
            className={key === step ? 'active' : ''}
            aria-current={key === step ? 'step' : undefined}
          >
            {index + 1}. {stepLabels[key]}
          </li>
        ))}
      </ol>
      {step === 'setup' && !choices.compatibleCodes.length && (
        <p className="notice">
          {text.launchBlocked} <Link to={`/projects/${projectId}/codes`}>{text.newCode}</Link>
        </p>
      )}
      {/* A Task keeps the code, parameters and computer, so a repeated run starts there. */}
      {step === 'setup' && !existingRun && (
        <p className="muted">
          {text.launchFromTaskHint}{' '}
          <Link to={`/projects/${projectId}/tasks`}>{text.launchOpenTasks}</Link>
        </p>
      )}
      {step === 'resources' && !choices.compatibleTargets.length && (
        <p className="notice">{text.noCompatibleTargets}</p>
      )}
      {form.clearedChoices.map((choice) => (
        <p className="notice" role="status" key={choice}>
          {clearedChoiceNotices[choice]}
        </p>
      ))}
      {step !== 'setup' && choices.target && targetCoverage && (
        <WorkerMissingNotice
          target={choices.target}
          coverage={targetCoverage}
          consequence={workerCoverageText.launchWorkerMissingHint}
        />
      )}
      <fieldset disabled={launch.pending}>
        {step === 'review' ? (
          <LaunchReview values={values} choices={choices} options={options} />
        ) : (
          <FormFields
            fields={
              step === 'setup'
                ? launchSetupFields({ options, choices })
                : launchResourceFields({ choices, coverageOf })
            }
            values={values}
            onChange={form.changeValues}
          />
        )}
        {step === 'review' && choices.target && isManualSite(choices.target) && (
          <LaunchManualSubmissionNotice targetId={choices.target.id} />
        )}
        {step === 'review' && choices.selectedCode && (
          <CodeRuntimeDetails version={choices.selectedCode} />
        )}
      </fieldset>
      <ErrorNotice message={form.validationError ?? launch.error} />
      <footer>
        <button type="button" className="button" onClick={onClose} disabled={launch.pending}>
          {text.cancel}
        </button>
        {step !== 'setup' && (
          <button
            type="button"
            className="button"
            onClick={form.goBack}
            disabled={launch.pending}
          >
            {text.back}
          </button>
        )}
        <button
          className="button primary"
          disabled={
            launch.pending ||
            (step === 'setup' && !choices.compatibleCodes.length) ||
            (step === 'resources' && !choices.compatibleTargets.length)
          }
        >
          {step === 'review' ? text.launch : text.next}
        </button>
      </footer>
    </form>
  );
}
