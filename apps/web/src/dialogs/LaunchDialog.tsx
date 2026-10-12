import type { TrainingContinuation } from '../types/trainingContinuation';
import { trainingText } from '../i18n/training';
import type { Job, Run } from '@mmt/contracts';
import { useProject } from '../hooks/useProject';
import { useProjectTargets } from '../hooks/useProjectTargets';
import { useProjectWorkers } from '../hooks/useProjectWorkers';
import { useExecutionCatalog } from '../hooks/useExecutionCatalog';
import { useLaunch } from '../hooks/useLaunch';
import { Dialog } from '../components/Dialog';
import { Resource } from '../components/Feedback';
import { LaunchForm } from '../components/LaunchForm';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * Starts a Job: a new Run and its Job, or the Job of an existing queued Run (`existingRun`, the
 * Run's page). The form waits for the Project's code, models and computers to load.
 */
export function LaunchDialog({
  existingRun,
  continuation,
  onClose,
  onSaved,
}: {
  existingRun?: Run;
  continuation?: TrainingContinuation;
  onClose: () => void;
  onSaved: (job: Job) => void;
}) {
  useLocale();
  const { project } = useProject();
  const catalog = useExecutionCatalog(project.id);
  const targets = useProjectTargets(project.id);
  const workers = useProjectWorkers(project.id);
  const launch = useLaunch(project.id, existingRun);
  return (
    <Dialog
      title={continuation ? trainingText.continueTraining : text.launchTitle}
      onClose={onClose}
      busy={launch.pending}
      wide
    >
      <Resource query={catalog}>
        {(choices) => (
          <Resource query={targets}>
            {(computeTargets) => (
              <LaunchForm
                projectId={project.id}
                existingRun={existingRun}
                continuation={continuation}
                catalog={choices}
                targets={computeTargets}
                workers={workers.value}
                launch={launch}
                onClose={onClose}
                onSaved={onSaved}
              />
            )}
          </Resource>
        )}
      </Resource>
    </Dialog>
  );
}
