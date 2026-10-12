import type { WorkflowVersion } from '@mmt/contracts';
import { Link } from 'react-router-dom';
import { DetailsList, JsonDetails } from '../JsonDetails';
import { text } from '../../i18n/catalog';
import { workflowsText as labels, workflowsTextTemplates } from '../../i18n/workflows';
import { joinLabels } from '../../i18n/textJoining';
import { datasetRoleLabel } from '../../lib/workflowLabels';
import { QUALITY_GATE_OPERATOR_SYMBOLS } from '../../lib/workflowDraft';
import { useLocale } from '../../i18n/useLocale';

export function WorkflowVersionDetails({ version }: { version: WorkflowVersion }) {
  useLocale();
  return (
    <details className="workflow-definition">
      <summary>
        {joinLabels([
          labels.workflowSteps,
          workflowsTextTemplates.workflowVersionLabel(version.revision),
        ])}
      </summary>
      <ol className="workflow-steps">
        {version.steps.map((step) => (
          <li key={step.key} className="workflow-step">
            <h3>
              {step.name} <span className="muted">· {text[step.task.kind]}</span>
            </h3>
            <DetailsList
              entries={[
                [
                  labels.workflowTask,
                  <Link to={`/projects/${version.projectId}/tasks?id=${step.task.id}`}>
                    {joinLabels([
                      step.task.name,
                      workflowsTextTemplates.workflowVersionLabel(step.task.revision),
                    ])}
                  </Link>,
                ],
                [
                  text.codeVersion,
                  <Link
                    className="mono"
                    to={`/projects/${version.projectId}/codes?version=${step.task.codeVersionId}`}
                  >
                    {step.task.codeVersionId}
                  </Link>,
                ],
                [labels.workflowModelSource, step.modelFromStepKey ?? step.task.modelVersionId],
              ]}
            />
            {step.inputs.length > 0 && (
              <>
                <h4>{labels.workflowInputs}</h4>
                <ul>
                  {step.inputs.map((input, index) => (
                    <li key={index}>
                      {input.source.kind === 'dataset' ? (
                        <Link
                          className="mono"
                          to={`/projects/${version.projectId}/datasets?version=${input.source.datasetVersionId}`}
                        >
                          {input.source.datasetVersionId}
                        </Link>
                      ) : (
                        `${input.source.stepKey} → ${input.source.datasetName ?? '*'}`
                      )}
                      {' · '}
                      {datasetRoleLabel(input.role)} · {labels.workflowWeight}: {input.weight}
                      {Object.keys(input.selection).length > 0 && (
                        <JsonDetails value={input.selection} />
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {step.qualityGates.length > 0 && (
              <>
                <h4>{labels.workflowQualityGates}</h4>
                <ul>
                  {step.qualityGates.map((gate, index) => (
                    <li key={index} className="mono">
                      {gate.metric} {QUALITY_GATE_OPERATOR_SYMBOLS[gate.operator]}{' '}
                      {gate.threshold}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <details>
              <summary>{text.parameters}</summary>
              <JsonDetails value={step.task.parameters} />
            </details>
          </li>
        ))}
      </ol>
    </details>
  );
}
