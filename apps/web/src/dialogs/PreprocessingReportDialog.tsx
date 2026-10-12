import { useState } from 'react';
import type { PreprocessingReport } from '@mmt/contracts';
import { preprocessingReportsApi } from '../api/preprocessingReports';
import { buildPreprocessingReportInput } from '../lib/preprocessingReportInput';
import { useMutation } from '../hooks/useMutation';
import { Dialog } from '../components/Dialog';
import { ErrorNotice } from '../components/Feedback';
import { workflowsText as labels } from '../i18n/workflows';
import { text } from '../i18n/catalog';
import { useLocale } from '../i18n/useLocale';

export function PreprocessingReportDialog({
  projectId,
  runId,
  report,
  onClose,
  onSaved,
}: {
  projectId: string;
  runId: string;
  report: PreprocessingReport | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  useLocale();
  const mutation = useMutation();
  const [counts, setCounts] = useState({
    inputCount: report?.inputCount ?? 0,
    outputCount: report?.outputCount ?? 0,
    excludedCount: report?.excludedCount ?? 0,
    failedCount: report?.failedCount ?? 0,
  });
  const [reasons, setReasons] = useState(
    JSON.stringify(
      { exclusions: report?.exclusions ?? [], failures: report?.failures ?? [] },
      null,
      2,
    ),
  );
  const [metrics, setMetrics] = useState(JSON.stringify(report?.metrics ?? {}, null, 2));
  const [samples, setSamples] = useState((report?.sampleArtifactIds ?? []).join('\n'));
  const [durations, setDurations] = useState({
    inputDurationSeconds: report?.inputDurationSeconds?.toString() ?? '',
    outputDurationSeconds: report?.outputDurationSeconds?.toString() ?? '',
  });
  const countLabels: Record<keyof typeof counts, string> = {
    inputCount: labels.preprocessingInput,
    outputCount: labels.preprocessingOutput,
    excludedCount: labels.preprocessingExcluded,
    failedCount: labels.preprocessingFailed,
  };
  const durationLabels = {
    inputDurationSeconds: labels.preprocessingInputDuration,
    outputDurationSeconds: labels.preprocessingOutputDuration,
  };
  return (
    <Dialog wide title={labels.preprocessingReportEdit} onClose={onClose} busy={mutation.pending}>
      <form
        className="workflow-form"
        onSubmit={(event) => {
          event.preventDefault();
          void mutation.run(async () => {
            const input = buildPreprocessingReportInput({
              counts,
              durations,
              reasonsJson: reasons,
              metricsJson: metrics,
              samples,
              metadata: report?.metadata ?? {},
            });
            await preprocessingReportsApi.save(projectId, runId, input);
            onSaved();
          });
        }}
      >
        <p className="muted">{labels.preprocessingReportHint}</p>
        <div className="workflow-fields">
          {(Object.keys(counts) as Array<keyof typeof counts>).map((key) => (
            <label className="field" key={key}>
              <span>{countLabels[key]}</span>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={counts[key]}
                onChange={(event) => setCounts({ ...counts, [key]: event.target.valueAsNumber })}
              />
            </label>
          ))}
          {(Object.keys(durations) as Array<keyof typeof durations>).map((key) => (
            <label className="field" key={key}>
              <span>{durationLabels[key]}</span>
              <input
                type="number"
                min="0"
                step="any"
                value={durations[key]}
                onChange={(event) => setDurations({ ...durations, [key]: event.target.value })}
              />
            </label>
          ))}
        </div>
        <label className="field">
          <span>{labels.preprocessingReasonsJson}</span>
          <textarea
            rows={5}
            value={reasons}
            spellCheck={false}
            onChange={(event) => setReasons(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{labels.preprocessingMetricsJson}</span>
          <textarea
            rows={3}
            value={metrics}
            spellCheck={false}
            onChange={(event) => setMetrics(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{labels.preprocessingSampleIds}</span>
          <textarea rows={2} value={samples} onChange={(event) => setSamples(event.target.value)} />
        </label>
        <ErrorNotice message={mutation.error} />
        <footer>
          <button className="button primary" disabled={mutation.pending}>
            {text.save}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
