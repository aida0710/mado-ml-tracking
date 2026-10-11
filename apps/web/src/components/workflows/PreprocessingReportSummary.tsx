import type { PreprocessingReport } from '@mmt/contracts';
import { Link } from 'react-router-dom';
import { DetailsList, JsonDetails } from '../JsonDetails';
import { workflowsText as labels } from '../../i18n/workflows';
import { useLocale } from '../../i18n/useLocale';

export function PreprocessingReportSummary({ report }: { report: PreprocessingReport }) {
  useLocale();
  const reasons = [
    ...report.exclusions.map((reason) => ({ ...reason, category: labels.preprocessingExcluded })),
    ...report.failures.map((reason) => ({ ...reason, category: labels.preprocessingFailed })),
  ];
  return (
    <section className="preprocessing-report">
      <h3>{labels.preprocessingReport}</h3>
      <DetailsList
        entries={[
          [labels.preprocessingInput, report.inputCount],
          [labels.preprocessingOutput, report.outputCount],
          [labels.preprocessingExcluded, report.excludedCount],
          [labels.preprocessingFailed, report.failedCount],
          [labels.preprocessingInputDuration, report.inputDurationSeconds],
          [labels.preprocessingOutputDuration, report.outputDurationSeconds],
        ]}
      />
      {reasons.length > 0 && (
        <>
          <h4>{labels.preprocessingReasons}</h4>
          <ul>
            {reasons.map((reason, index) => (
              <li key={index}>
                {reason.category} · {reason.reason}: {reason.count}
              </li>
            ))}
          </ul>
        </>
      )}
      {Object.keys(report.metrics).length > 0 && <JsonDetails value={report.metrics} />}
      {report.sampleArtifactIds.length > 0 && (
        <>
          <h4>{labels.preprocessingSamples}</h4>
          <ul>
            {report.sampleArtifactIds.map((id) => (
              <li key={id}>
                <Link
                  className="mono"
                  to={`/projects/${report.projectId}/runs/${report.runId}?tab=artifacts`}
                >
                  {id}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
