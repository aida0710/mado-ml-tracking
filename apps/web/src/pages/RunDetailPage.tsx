import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Play, RefreshCw, Upload } from 'lucide-react';
import {
  RUN_NOTE_TAG,
  isTrainingRunKind,
  type ChartPanelLayout,
  type ChartXAxis,
  type Run,
  type RunResumeEventPage,
} from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { useAuth } from '../hooks/useAuth';
import { useProject } from '../hooks/useProject';
import { EXECUTION_POLL_MS, useQuery } from '../hooks/useQuery';
import { PageHeader } from '../components/PageHeader';
import { Resource } from '../components/Feedback';
import { RunStatusBadge } from '../components/runs/RunStatusBadge';
import { RunBreadcrumb } from '../components/runs/RunBreadcrumb';
import { CopyableValue } from '../components/CopyableValue';
import { ChartPanelGrid } from '../components/charts/ChartPanelGrid';
import { RunResumeTimeline } from '../components/RunResumeTimeline';
import { RunDescriptionEditor } from '../components/RunDescriptionEditor';
import { CommentThread } from '../components/comments/CommentThread';
import { RunMediaPanel } from '../components/media/RunMediaPanel';
import { Tabs } from '../components/Tabs';
import { RunLogs } from '../components/RunLogs';
import { RunArtifacts, RUN_ARTIFACT_PREFIX_PARAMETER } from '../components/RunArtifacts';
import { RunExecutionSnapshot } from '../components/RunExecutionSnapshot';
import { RunOutputModels } from '../components/RunOutputModels';
import { TrainingDataStagesPanel } from '../components/TrainingDataStagesPanel';
import { trainingText } from '../i18n/training';
import { RunCheckpointList } from '../components/RunCheckpointList';
import { RunDownstream } from '../components/RunDownstream';
import { RunWorkflowContext } from '../components/workflows/RunWorkflowContext';
import { DetailsList, KeyValues } from '../components/JsonDetails';
import { FormDialog } from '../components/FormDialog';
import { ArtifactUploadDialog } from '../dialogs/ArtifactUploadDialog';
import { LaunchDialog } from '../dialogs/LaunchDialog';
import { getFieldValue, parseStringMap } from '../lib/formValues';
import { formatDate, formatDuration } from '../lib/format';
import { resumeMarkers } from '../lib/metricSeries';
import {
  addPanel,
  createDefaultLayout,
  createPanelConfig,
  emptyChartPanelLayout,
  MAX_PANEL_METRIC_KEYS,
} from '../lib/chartPanelLayout';
import {
  groupSystemMetricKeys,
  isSystemMetricKey,
  systemMetricValueScale,
} from '../lib/systemMetricKeys';
import { getRunChartKeys } from '../lib/runChartKeys';
import { useChartPanelLayout } from '../hooks/useChartPanelLayout';
import { useRunResumeEvents } from '../hooks/useRunResumeEvents';
import { useRunJob } from '../hooks/useRunJob';
import { useRunLogs } from '../hooks/useRunLogs';
import { getRunParameters } from '../lib/runParameters';
import { creatorName } from '../lib/creatorName';
import { getResumeCheckpointRecord } from '../lib/checkpointResume';
import { canControlJob } from '../lib/permissions';
import { workflowIdOfRun } from '../lib/workflowRunTags';
import { isTerminalRun } from '../lib/runOutputRegistrationState';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';
import { systemMetricCategoryLabels, systemMetricUnitLabels } from '../i18n/runs';

const tabs = [
  'metrics',
  'media',
  'artifacts',
  'checkpoints',
  'trainingData',
  'systemMetrics',
  'logs',
  'details',
  'executionSnapshot',
] as const;
type RunTab = (typeof tabs)[number];
const tabLabels: Record<RunTab, string> = {
  get metrics() { return text.metrics; },
  get media() { return text.mediaTab; },
  get artifacts() { return text.artifacts; },
  get checkpoints() { return text.checkpoints; },
  get trainingData() { return trainingText.trainingData; },
  get systemMetrics() { return text.systemMetrics; },
  get logs() { return text.logs; },
  get details() { return text.details; },
  get executionSnapshot() { return text.executionSnapshot; },
};

export function RunDetailPage() {
  useLocale();
  const { project, canEdit } = useProject();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { runId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab');
  const tab = tabs.find((key) => key === requestedTab) ?? 'metrics';
  const [dialog, setDialog] = useState<'edit' | 'upload' | 'launch' | null>(null);
  const run = useQuery({
    key: `${project.id}:run:${runId}`,
    load: (signal) => trackingApi.run(project.id, runId, signal),
    pollMs: EXECUTION_POLL_MS,
  });
  const resumeEvents = useRunResumeEvents(project.id, runId, run.value?.status);
  const logs = useRunLogs({
    projectId: project.id,
    run: run.value,
    enabled: tab === 'logs',
    isLive: Boolean(run.value && !isTerminalRun(run.value)),
  });
  // コードのあるRunは起動したときにJobができるので、状態にかかわらずJobを探す（[Jobを見る]）。
  // Jobの無いqueuedのRunは起動でき、Jobができたら再び起動しても拒まれる。
  const runsCode = Boolean(run.value?.codeVersionId);
  const awaitsJob = run.value?.status === 'queued' && runsCode;
  const runJob = useRunJob({ projectId: project.id, runId, enabled: runsCode });
  // Artifactのタブはフォルダごとに自分でページ送りする。全ファイルが要るのは実行snapshotだけ。
  const [artifactRevision, setArtifactRevision] = useState(0);
  const artifacts = useQuery({
    key: tab === 'executionSnapshot' ? `${runId}:artifacts` : null,
    load: (signal) => trackingApi.artifacts(project.id, runId, signal),
    pollMs: EXECUTION_POLL_MS,
  });
  function reload() {
    run.reload();
    resumeEvents.reload();
    logs.lines.reload();
    runJob.reload();
    artifacts.reload();
    setArtifactRevision((value) => value + 1);
  }
  const base = `/projects/${project.id}`;
  return (
    <section className="page">
      <Resource query={run}>
        {(item) => (
          <>
            <PageHeader
              title={item.name}
              eyebrow={<RunBreadcrumb run={item} />}
              description={
                <>
                  <RunStatusBadge run={item} />
                  <CopyableValue label={text.runIdLabel} value={item.id} />
                  <span>{text[item.kind]}</span>
                  <span>
                    {textTemplates.runExecutionMode(
                      item.executionMode === 'test' ? text.testMode : text.runMode,
                    )}
                  </span>
                  {item.taskId && <Link to={`${base}/tasks?id=${item.taskId}`}>{text.taskRevision}: {item.taskRevision}</Link>}
                  <span>{formatDuration(item.startedAt, item.endedAt)}</span>
                  <ResumedFromCheckpoint run={item} />
                </>
              }
              actions={
                <>
                  {canEdit && (
                    <>
                      <button className="button" onClick={() => setDialog('edit')}>
                        {text.editRun}
                      </button>
                      {awaitsJob && runJob.value === null && (
                        <button className="button primary" onClick={() => setDialog('launch')}>
                          <Play size={15} />
                          {text.launch}
                        </button>
                      )}
                    </>
                  )}
                  {runJob.value && (
                    <Link className="button" to={`${base}/jobs?job=${runJob.value.id}`}>
                      {text.runOpenJob}
                    </Link>
                  )}
                  <button className="icon-button" onClick={reload} aria-label={text.refresh}>
                    <RefreshCw size={17} />
                  </button>
                </>
              }
            />
            {item.error && (
              <div className="notice error" role="alert">
                {item.error}
              </div>
            )}
            {resumeEvents.value && (
              <RunResumeTimeline segments={resumeEvents.value.segments} now={resumeEvents.value.readAt} />
            )}
            <Tabs
              tabs={tabs
                .filter((key) => key !== 'trainingData' || isTrainingRunKind(item.kind))
                .map((key) => ({ key, label: tabLabels[key] }))}
              selected={tab}
              onSelect={(key) => setParams({ tab: key })}
            />
            <div
              id="run-tab-panel"
              role="tabpanel"
              aria-label={tabLabels[tab]}
              className="detail-content"
            >
              {tab === 'metrics' && (
                <RunMetricCharts run={item} resumeEvents={resumeEvents.value} />
              )}
              {tab === 'systemMetrics' && <RunSystemMetricCharts key={item.id} run={item} />}
              {tab === 'media' && <RunMediaPanel projectId={project.id} runId={runId} />}
              {tab === 'logs' && <RunLogs logs={logs} />}
              {tab === 'executionSnapshot' && <Resource query={artifacts}>
                {(files) => <RunExecutionSnapshot run={item} artifacts={files} />}
              </Resource>}
              {tab === 'artifacts' && (
                <>
                  {canEdit && (
                    <div className="section-actions">
                      <button className="button" onClick={() => setDialog('upload')}>
                        <Upload size={15} />
                        {text.uploadArtifact}
                      </button>
                    </div>
                  )}
                  <RunArtifacts projectId={project.id} runId={runId} revision={artifactRevision} />
                </>
              )}
              {tab === 'checkpoints' && (
                <RunCheckpointList
                  run={item}
                  canEdit={canEdit}
                  canRecordData={canEdit && (!isTerminalRun(item) || !runsCode || runJob.value === null)}
                  onContinued={(job) => navigate(`/projects/${project.id}/runs/${job.runId}`)}
                  canRetryJob={canControlJob(project.role, user.id, item) && !workflowIdOfRun(item)}
                />
              )}
              {tab === 'trainingData' && (
                <TrainingDataStagesPanel
                  run={item}
                  canRecord={canEdit && (!isTerminalRun(item) || !runsCode || runJob.value === null)}
                  onSaved={reload}
                />
              )}
              {tab === 'details' && (
                <div className="details-grid">
                  <RunWorkflowContext run={item} canEdit={canEdit} />
                  <RunDescriptionEditor projectId={project.id} run={item} />
                  <section>
                    <h2>{text.details}</h2>
                    <DetailsList
                      entries={[
                        [text.created, formatDate(item.createdAt)],
                        [text.user, <span title={item.createdBy}>{creatorName(item)}</span>],
                        [
                          text.modelVersion,
                          item.modelVersionId ? (
                            <Link
                              className="mono"
                              to={`${base}/models?version=${item.modelVersionId}`}
                            >
                              {item.modelVersionId}
                            </Link>
                          ) : null,
                        ],
                        [
                          text.codeVersion,
                          item.codeVersionId ? (
                            <Link
                              className="mono"
                              to={`${base}/codes?version=${item.codeVersionId}`}
                            >
                              {item.codeVersionId}
                            </Link>
                          ) : null,
                        ],
                        [
                          text.parentRun,
                          item.parentRunId ? (
                            <Link to={`${base}/runs/${item.parentRunId}`}>{item.parentRunId}</Link>
                          ) : null,
                        ],
                        [
                          text.inputDatasets,
                          item.inputDatasetVersionIds.map((id) => (
                            <Link
                              className="version-link mono"
                              key={id}
                              to={`${base}/datasets?version=${id}`}
                            >
                              {id}
                            </Link>
                          )),
                        ],
                        [text.outputModels, <RunOutputModels run={item} />],
                        [
                          text.outputDatasets,
                          item.outputDatasetVersionIds.map((id) => (
                            <Link
                              className="version-link mono"
                              key={id}
                              to={`${base}/datasets?version=${id}`}
                            >
                              {id}
                            </Link>
                          )),
                        ],
                      ]}
                    />
                  </section>
                  <RunDownstream projectId={project.id} runId={runId} />
                  <section>
                    <h2>{text.parameters}</h2>
                    <KeyValues values={getRunParameters(item)} />
                  </section>
                  <section>
                    <h2>{text.tags}</h2>
                    <KeyValues values={tagsWithoutDescription(item.tags)} />
                  </section>
                  <section>
                    <h2>{text.environment}</h2>
                    <KeyValues values={item.environment} />
                  </section>
                  <CommentThread projectId={project.id} targetType="run" targetId={runId} />
                </div>
              )}
            </div>
            {dialog === 'edit' && (
              <FormDialog
                title={text.editRun}
                onClose={() => setDialog(null)}
                fields={[
                  { name: 'name', label: text.name, required: true, defaultValue: item.name },
                  {
                    name: 'tags',
                    label: `${text.tags} (JSON)`,
                    type: 'textarea',
                    defaultValue: JSON.stringify(item.tags, null, 2),
                  },
                ]}
                onSubmit={(values) =>
                  trackingApi.updateRun(project.id, runId, {
                    name: getFieldValue(values, 'name'),
                    tags: parseStringMap(getFieldValue(values, 'tags')),
                  })
                }
                onSaved={() => {
                  setDialog(null);
                  run.reload();
                }}
              />
            )}
            {dialog === 'launch' && (
              <LaunchDialog
                existingRun={item}
                onClose={() => setDialog(null)}
                onSaved={() => {
                  setDialog(null);
                  reload();
                }}
              />
            )}
          </>
        )}
      </Resource>
      {/* Resourceの外に置く。Runのポーリングの失敗で、ダイアログを外してアップロードを止めないため。 */}
      {dialog === 'upload' && (
        <ArtifactUploadDialog
          projectId={project.id}
          runId={runId}
          multiple
          initialFolder={params.get(RUN_ARTIFACT_PREFIX_PARAMETER) ?? ''}
          onClose={() => setDialog(null)}
          onSaved={() => {
            artifacts.reload();
            setArtifactRevision((value) => value + 1);
          }}
        />
      )}
    </section>
  );
}

/** checkpointから続くRunについて、始まるstepと、そのcheckpointを保存したRun。 */
function ResumedFromCheckpoint({ run }: { run: Run }) {
  useLocale();
  const resume = getResumeCheckpointRecord(run);
  if (!resume) return null;
  return (
    <>
      <span>{textTemplates.checkpointResumedFromStep(resume.step)}</span>
      <Link to={`/projects/${run.projectId}/runs/${resume.sourceRunId}?tab=checkpoints`}>
        {text.checkpointSourceRun}
      </Link>
    </>
  );
}

const runLabelsOf = (run: Run) => ({ [run.id]: run.name });

// 説明は上にMarkdownで出すので、タグとしても出すと加工しない1行で繰り返してしまう。
function tagsWithoutDescription(tags: Record<string, string>): Record<string, string> {
  const { [RUN_NOTE_TAG]: _description, ...rest } = tags;
  return rest;
}

/**
 * システムメトリクスはworkerが一定の間隔で取るので、stepは学習のstepではなく取った回の番号。
 * そのため経過時間でRunとそろえる。
 */
const SYSTEM_METRIC_X_AXIS: ChartXAxis = { kind: 'relative_time' };

/** 1つのRunのメトリクスのパネル。並びはProjectごとに持ち、再開した区間はx軸に印を付ける。 */
function RunMetricCharts({
  run,
  resumeEvents,
}: {
  run: Run;
  resumeEvents: RunResumeEventPage | undefined;
}) {
  useLocale();
  const metricKeys = useMemo(() => getRunChartKeys([run]).metricKeys, [run]);
  const defaultLayout = useMemo(
    () => createDefaultLayout(metricKeys, (index) => `default-${index}`),
    [metricKeys],
  );
  const { layout, isCustomized, updateLayout, resetLayout } = useChartPanelLayout(
    run.projectId,
    'runDetail',
    defaultLayout,
  );
  const markersFor = (xAxis: ChartXAxis) =>
    resumeEvents ? resumeMarkers(xAxis, [{ label: text.chartResumeMarker, resumeEvents }]) : [];
  return (
    <ChartPanelGrid
      projectId={run.projectId}
      layout={layout}
      source={{ runIds: [run.id] }}
      runLabels={runLabelsOf(run)}
      live={run.status === 'running'}
      metricKeys={metricKeys}
      markersFor={markersFor}
      onLayoutChange={updateLayout}
      {...(isCustomized ? { onResetLayout: resetLayout } : {})}
    />
  );
}

/**
 * 種類、GPU、単位ごとに1つのパネル。worker/SDKの名前でもMLflowの名前でも同じにする。パネルは
 * Runのメトリクスに従い、変更はタブを開いている間だけ続く。
 */
function RunSystemMetricCharts({ run }: { run: Run }) {
  useLocale();
  const metricKeys = useMemo(
    () => Object.keys(run.latestMetrics).filter(isSystemMetricKey).sort(),
    [run.latestMetrics],
  );
  const defaultLayout = useMemo(() => createSystemMetricLayout(metricKeys), [metricKeys]);
  const [changedLayout, setChangedLayout] = useState<ChartPanelLayout | null>(null);
  const layout = changedLayout ?? defaultLayout;
  return (
    <ChartPanelGrid
      projectId={run.projectId}
      layout={layout}
      source={{ runIds: [run.id] }}
      runLabels={runLabelsOf(run)}
      live={run.status === 'running'}
      metricKeys={metricKeys}
      valueScale={systemMetricValueScale}
      onLayoutChange={(change) => setChangedLayout(change(layout))}
      {...(changedLayout ? { onResetLayout: () => setChangedLayout(null) } : {})}
      emptyMessage={text.systemMetricsEmpty}
    />
  );
}

function createSystemMetricLayout(metricKeys: string[]): ChartPanelLayout {
  return groupSystemMetricKeys(metricKeys).reduce((layout, group) => {
    const title = textTemplates.systemMetricPanelTitle(
      systemMetricCategoryLabels[group.category],
      systemMetricUnitLabels[group.unit],
      group.gpuIndex,
    );
    const panel = {
      ...createPanelConfig(group.metricKeys.slice(0, MAX_PANEL_METRIC_KEYS), title),
      xAxis: SYSTEM_METRIC_X_AXIS,
    };
    return addPanel(layout, panel, { id: `system-${group.id}`, width: 'half' });
  }, emptyChartPanelLayout());
}
