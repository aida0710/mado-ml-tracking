import { useRef, useState } from 'react';
import { WORKFLOW_MAX_STEPS, type WorkflowStep } from '@mmt/contracts';
import { workflowsApi } from '../api/workflows';
import { useMutation } from '../hooks/useMutation';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useWorkflowOptions } from '../hooks/useWorkflowOptions';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dialog } from '../components/Dialog';
import { Resource, ErrorNotice } from '../components/Feedback';
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog';
import { WorkflowStepEditor } from '../components/workflows/WorkflowStepEditor';
import {
  earlierStepChoices,
  newWorkflowStep,
  renameStepReferences,
  workflowStepDrafts,
} from '../lib/workflowDraft';
import { pinWorkflowDrafts } from '../lib/workflowDraftSave';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { workflowsText as labels, workflowsTextTemplates } from '../i18n/workflows';

/**
 * Creates a workflow, or (with `previous`) its next version from the shown version's steps.
 * Closing with unsaved edits asks first, as the Task editor does.
 */
export function WorkflowDialog({
  projectId,
  previous,
  onClose,
  onSaved,
}: {
  projectId: string;
  previous?: { workflowId: string; expectedRevision: number; steps: WorkflowStep[] };
  onClose: () => void;
  onSaved: (workflowId: string) => void;
}) {
  useLocale();
  const options = useWorkflowOptions(projectId);
  const mutation = useMutation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState(() =>
    previous ? workflowStepDrafts(previous.steps) : [newWorkflowStep([])],
  );
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const draft = JSON.stringify({ name, description, steps });
  const initialDraft = useRef(draft);
  const unsaved = useUnsavedChanges(draft !== initialDraft.current, mutation.pending, {
    onNavigationDiscard: onClose,
  });
  const close = () => unsaved.requestAction(onClose);
  const removingStep = removingIndex === null ? undefined : steps[removingIndex];
  return (
    <>
      <Dialog
        wide
        title={previous ? labels.workflowNewVersion : labels.workflowNew}
        busy={mutation.pending}
        onClose={close}
      >
        <Resource query={options}>
          {(choices) => (
            <form
              className="workflow-form"
              onSubmit={(event) => {
                event.preventDefault();
                void mutation.run(async () => {
                  const pinned = pinWorkflowDrafts(steps, choices.tasks);
                  if (previous) {
                    await workflowsApi.createVersion(projectId, previous.workflowId, {
                      expectedRevision: previous.expectedRevision,
                      steps: pinned,
                    });
                    onSaved(previous.workflowId);
                  } else {
                    const detail = await workflowsApi.create(projectId, {
                      name,
                      description,
                      steps: pinned,
                    });
                    onSaved(detail.workflow.id);
                  }
                });
              }}
            >
              <p className="muted">
                {previous ? labels.workflowNewVersionHint : labels.workflowSnapshotHint}
              </p>
              {!choices.tasks.length && <p className="notice">{labels.workflowNoTasks}</p>}
              {!previous && (
                <>
                  <label className="field">
                    <span>{text.name}</span>
                    <input
                      value={name}
                      required
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>{text.description}</span>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </label>
                </>
              )}
              {steps.map((step, index) => (
                <WorkflowStepEditor
                  key={index}
                  step={step}
                  tasks={choices.tasks}
                  datasets={choices.datasetVersions}
                  earlierSteps={earlierStepChoices(steps, index)}
                  onChange={(next) =>
                    setSteps((current) =>
                      current.map((item, position) => (position === index ? next : item)),
                    )
                  }
                  onKeyRenamed={(rename) =>
                    setSteps((current) =>
                      renameStepReferences(current, { ...rename, stepIndex: index }),
                    )
                  }
                  onRemove={() => setRemovingIndex(index)}
                />
              ))}
              <button
                type="button"
                className="button"
                disabled={steps.length >= WORKFLOW_MAX_STEPS}
                onClick={() => setSteps((current) => [...current, newWorkflowStep(current)])}
              >
                {labels.workflowAddStep}
              </button>
              <ErrorNotice message={mutation.error} />
              <footer className="dialog-actions">
                <button
                  type="button"
                  className="button"
                  disabled={mutation.pending}
                  onClick={close}
                >
                  {text.cancel}
                </button>
                <button
                  className="button primary"
                  disabled={mutation.pending || !steps.length || !choices.tasks.length}
                >
                  {text.save}
                </button>
              </footer>
            </form>
          )}
        </Resource>
      </Dialog>
      {removingIndex !== null && removingStep && (
        <ConfirmDialog
          title={labels.workflowRemoveStep}
          message={workflowsTextTemplates.workflowRemoveStepTarget(
            removingStep.name || removingStep.key,
          )}
          confirmLabel={labels.workflowRemoveStepConfirm}
          destructive
          onConfirm={async () =>
            setSteps((current) => current.filter((_, position) => position !== removingIndex))
          }
          onConfirmed={() => setRemovingIndex(null)}
          onClose={() => setRemovingIndex(null)}
        />
      )}
      {unsaved.confirmingDiscard && (
        <UnsavedChangesDialog onDiscard={unsaved.discard} onKeepEditing={unsaved.keepEditing} />
      )}
    </>
  );
}
