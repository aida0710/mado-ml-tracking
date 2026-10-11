import { useState } from 'react';
import { WORKFLOW_MAX_STEPS, type WorkflowStep } from '@mmt/contracts';
import { workflowsApi } from '../api/workflows';
import { useMutation } from '../hooks/useMutation';
import { useWorkflowOptions } from '../hooks/useWorkflowOptions';
import { Dialog } from '../components/Dialog';
import { Resource, ErrorNotice } from '../components/Feedback';
import { WorkflowStepEditor } from '../components/workflows/WorkflowStepEditor';
import { newWorkflowStep, workflowStepDrafts, pinWorkflowDrafts } from '../lib/workflowDraft';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { workflowsText as labels } from '../i18n/workflows';

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
  return (
    <Dialog
      wide
      title={previous ? labels.workflowNewVersion : labels.workflowNew}
      busy={mutation.pending}
      onClose={onClose}
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
                  <input value={name} required onChange={(event) => setName(event.target.value)} />
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
                earlierSteps={steps
                  .slice(0, index)
                  .map((earlier) => ({ value: earlier.key, label: earlier.name || earlier.key }))}
                onChange={(next) =>
                  setSteps((current) =>
                    current.map((item, position) => (position === index ? next : item)),
                  )
                }
                onRemove={() =>
                  setSteps((current) => current.filter((_, position) => position !== index))
                }
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
                onClick={onClose}
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
  );
}
