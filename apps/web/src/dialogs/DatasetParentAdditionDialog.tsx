import type { DatasetVersion } from '@mmt/contracts';
import { datasetVersionParentsApi } from '../api/datasetVersionParents';
import { FormDialog } from '../components/FormDialog';
import { QueryDialog } from '../components/QueryDialog';
import { useProjectDatasetVersions } from '../hooks/useProjectDatasetVersions';
import { getFieldValue, getSelectedValues, parseJsonObject } from '../lib/formValues';
import { qualifiedDatasetVersionLabel } from '../lib/datasetVersionLabel';
import { useLocale } from '../i18n/useLocale';
import { datasetParentsText } from '../i18n/datasetParents';

export function DatasetParentAdditionDialog({
  version,
  onClose,
  onSaved,
}: {
  version: DatasetVersion;
  onClose: () => void;
  onSaved: () => void;
}) {
  useLocale();
  const versions = useProjectDatasetVersions(version.projectId);
  return (
    <QueryDialog title={datasetParentsText.addParents} query={versions} onClose={onClose}>
      {(choices) => (
        <FormDialog
          title={datasetParentsText.addParents}
          description={datasetParentsText.addParentsHint}
          submitLabel={datasetParentsText.addParents}
          onClose={onClose}
          fields={[
            {
              name: 'parentDatasetVersionIds',
              label: datasetParentsText.selectedParents,
              type: 'checkboxes',
              required: true,
              options: choices
                .filter(
                  (choice) =>
                    choice.id !== version.id &&
                    !version.parentDatasetVersionIds.includes(choice.id),
                )
                .map((choice) => ({
                  value: choice.id,
                  label: qualifiedDatasetVersionLabel(choice),
                })),
            },
            { name: 'reason', label: datasetParentsText.reason, type: 'textarea', required: true },
            {
              name: 'evidence',
              label: datasetParentsText.evidence,
              type: 'textarea',
              required: true,
              defaultValue: '{}',
            },
          ]}
          onSubmit={(values) =>
            datasetVersionParentsApi.append(
              {
                projectId: version.projectId,
                datasetId: version.datasetId,
                versionId: version.id,
              },
              {
                parentDatasetVersionIds: getSelectedValues(values, 'parentDatasetVersionIds'),
                reason: getFieldValue(values, 'reason'),
                evidence: parseJsonObject(getFieldValue(values, 'evidence')),
              },
            )
          }
          onSaved={onSaved}
        />
      )}
    </QueryDialog>
  );
}
