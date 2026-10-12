import type { DatasetUsage } from '@mmt/contracts';
import { Link } from 'react-router-dom';
import { JsonDetails } from '../JsonDetails';
import { workflowsText as labels } from '../../i18n/workflows';
import { datasetUsageLabel } from '../../lib/workflowLabels';
import { useLocale } from '../../i18n/useLocale';

export function DatasetUsagePanel({
  projectId,
  usage,
}: {
  projectId: string;
  usage: DatasetUsage[];
}) {
  useLocale();
  if (!usage.length) return null;
  return (
    <section className="workflow-usage">
      <h3>{labels.preprocessingUsage}</h3>
      <ul>
        {usage.map((input, index) => (
          <li key={index}>
            <Link
              className="mono"
              to={`/projects/${projectId}/datasets?version=${input.datasetVersionId}`}
            >
              {input.datasetVersionId}
            </Link>
            <span>{datasetUsageLabel(input)}</span>
            {Object.keys(input.selection).length > 0 && <JsonDetails value={input.selection} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
