import { useState } from 'react';
import type { Job, Run, RunCheckpoint, RunCheckpointArtifact } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { DataTable } from './DataTable';
import { Resource } from './Feedback';
import { LaunchDialog } from '../dialogs/LaunchDialog';
import { TrainingDataStageDialog } from '../dialogs/TrainingDataStageDialog';
import { useTrainingDataStages } from '../hooks/useTrainingDataStages';
import { canContinueTraining, datasetVersionIdsAtStep } from '../lib/checkpointTraining';
import { trainingText } from '../i18n/training';
import { ResumeDialog } from '../dialogs/ResumeDialog';
import { useRunCheckpoints } from '../hooks/useRunCheckpoints';
import { useRunJob } from '../hooks/useRunJob';
import {
  getCheckpointArtifactFileName,
  getCheckpointResumeOffer,
  isResumableStatus,
} from '../lib/checkpointResume';
import { formatBytes, formatDate } from '../lib/format';
import { useLocale } from '../i18n/useLocale';
import { checkpointSourceLabels } from '../i18n/checkpoints';
import { text, textTemplates } from '../i18n/catalog';

/**
 * Runのcheckpointとそのファイル、およびそのどれかから止まったRunを再開する操作。
 * `canRetryJob`は、ログイン中の利用者がRunのJobを再実行できるか（lib/permissionsのcanControlJob）。
 */
export function RunCheckpointList({
  run,
  canRetryJob,
  canEdit = false,
  canRecordData = false,
  onContinued,
}: {
  run: Run;
  canRetryJob: boolean;
  canEdit?: boolean;
  canRecordData?: boolean;
  onContinued?: (job: Job) => void;
}) {
  useLocale();
  const [continueTarget, setContinueTarget] = useState<RunCheckpoint | null>(null);
  const [dataTarget, setDataTarget] = useState<RunCheckpoint | null>(null);
  const dataHistory = useTrainingDataStages(run);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [resumeTarget, setResumeTarget] = useState<RunCheckpoint | null>(null);
  const checkpoints = useRunCheckpoints({ projectId: run.projectId, runId: run.id, includeHidden });
  // 再開できるのは、再実行してよい人が止まったRunを見ているときだけ。そのときだけJobを引く。
  const runJob = useRunJob({
    projectId: run.projectId,
    runId: run.id,
    enabled: canRetryJob && isResumableStatus(run.status),
  });
  const job = runJob.value ?? undefined;
  const resumeOffer = getCheckpointResumeOffer({ run, job, canRetryJob });
  return (
    <section className="checkpoint-list">
      <label className="checkpoint-hidden-toggle">
        <input
          type="checkbox"
          checked={includeHidden}
          onChange={(event) => setIncludeHidden(event.target.checked)}
        />
        {text.checkpointShowHidden}
      </label>
      {resumeOffer === 'creatorOnly' && <p className="muted">{text.checkpointResumeCreatorOnly}</p>}
      {runJob.value === null && <p className="muted">{text.checkpointResumeNoJob}</p>}
      <Resource query={checkpoints}>
        {(page) => (
          <DataTable
            items={page.items}
            rowKey={(checkpoint) => checkpoint.id}
            empty={text.checkpointEmpty}
            columns={[
              {
                key: 'step',
                label: text.step,
                render: (checkpoint) => (
                  <>
                    <span className="mono">{checkpoint.step}</span>
                    {!checkpoint.retained && (
                      <span
                        className="status-badge status-neutral"
                        title={text.checkpointHiddenHint}
                      >
                        {text.checkpointHidden}
                      </span>
                    )}
                  </>
                ),
              },
              {
                key: 'created',
                label: text.created,
                render: (checkpoint) => formatDate(checkpoint.createdAt),
              },
              {
                key: 'size',
                label: text.size,
                className: 'mono',
                render: (checkpoint) => formatBytes(checkpoint.totalSize),
              },
              {
                key: 'source',
                label: text.source,
                render: (checkpoint) => checkpointSourceLabels[checkpoint.source],
              },
              {
                key: 'optimizer',
                label: text.checkpointOptimizer,
                render: (checkpoint) =>
                  checkpoint.manifest.includesOptimizer
                    ? text.checkpointIncludesOptimizer
                    : text.checkpointExcludesOptimizer,
              },
              {
                key: 'framework',
                label: text.checkpointFramework,
                render: (checkpoint) => checkpoint.manifest.framework ?? '—',
              },
              {
                key: 'artifacts',
                label: text.artifacts,
                render: (checkpoint) => (
                  <CheckpointArtifactLinks
                    projectId={run.projectId}
                    artifacts={checkpoint.artifacts}
                  />
                ),
              },
              ...(canEdit
                ? [
                    {
                      key: 'continueTraining',
                      label: trainingText.trainingData,
                      render: (checkpoint: RunCheckpoint) => (
                        <div className="section-actions">
                          {canRecordData && (
                            <button
                              className="button small"
                              disabled={!dataHistory.value}
                              onClick={() => setDataTarget(checkpoint)}
                            >
                              {trainingText.recordTrainingData}
                            </button>
                          )}
                          <button
                            className="button small"
                            disabled={!dataHistory.value || !canContinueTraining(run)}
                            title={
                              !canContinueTraining(run)
                                ? trainingText.continueTrainingNoCode
                                : undefined
                            }
                            onClick={() => setContinueTarget(checkpoint)}
                          >
                            {trainingText.continueTraining}
                          </button>
                        </div>
                      ),
                    },
                  ]
                : []),
              ...(resumeOffer === 'resume'
                ? [
                    {
                      key: 'resume',
                      label: text.checkpointResumeTitle,
                      render: (checkpoint: RunCheckpoint) => (
                        <button
                          className="button small"
                          onClick={() => setResumeTarget(checkpoint)}
                        >
                          {text.checkpointResume}
                        </button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Resource>
      {continueTarget && dataHistory.value && (
        <LaunchDialog
          continuation={{
            run,
            checkpoint: continueTarget,
            inputDatasetVersionIds: datasetVersionIdsAtStep(
              dataHistory.value,
              continueTarget.step + 1,
            ),
          }}
          onClose={() => setContinueTarget(null)}
          onSaved={(created) => {
            setContinueTarget(null);
            onContinued?.(created);
          }}
        />
      )}
      {dataTarget && dataHistory.value && (
        <TrainingDataStageDialog
          run={run}
          history={dataHistory.value}
          checkpoint={dataTarget}
          onClose={() => setDataTarget(null)}
          onSaved={() => {
            setDataTarget(null);
            dataHistory.reload();
          }}
        />
      )}
      {resumeTarget && job && (
        <ResumeDialog
          projectId={run.projectId}
          jobId={job.id}
          checkpoint={resumeTarget}
          onClose={() => setResumeTarget(null)}
        />
      )}
    </section>
  );
}

/** ネイティブのcheckpointは1つのtar。MLflowのcheckpointは開閉できる欄の中にファイルを並べる。 */
function CheckpointArtifactLinks({
  projectId,
  artifacts,
}: {
  projectId: string;
  artifacts: RunCheckpointArtifact[];
}) {
  useLocale();
  const links = artifacts.map((artifact) => (
    <a
      key={artifact.id}
      className="mono"
      href={trackingApi.artifactUrl(projectId, artifact.id)}
      download={getCheckpointArtifactFileName(artifact)}
    >
      {artifact.path}
    </a>
  ));
  if (links.length <= 1) return <>{links}</>;
  return (
    <details>
      <summary>{textTemplates.checkpointFileCount(links.length)}</summary>
      <ul className="checkpoint-artifacts">
        {links.map((link) => (
          <li key={link.key}>{link}</li>
        ))}
      </ul>
    </details>
  );
}
