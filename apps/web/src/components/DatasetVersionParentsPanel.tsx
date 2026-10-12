import { useState } from 'react';
import type { DatasetVersion } from '@mmt/contracts';
import { DatasetParentAdditionDialog } from '../dialogs/DatasetParentAdditionDialog';
import { useDatasetVersionParents } from '../hooks/useDatasetVersionParents';
import { datasetParentsText } from '../i18n/datasetParents';
import { useLocale } from '../i18n/useLocale';
import { formatDate } from '../lib/format';
import { DataTable } from './DataTable';
import { DatasetVersionNameLinks } from './DatasetVersionNameLinks';
import { Resource } from './Feedback';
import { JsonDetails } from './JsonDetails';

export function DatasetVersionParentsPanel({
  version,
  canEdit,
  onSaved,
}: {
  version: DatasetVersion;
  canEdit: boolean;
  onSaved: () => void;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const history = useDatasetVersionParents({
    projectId: version.projectId,
    datasetId: version.datasetId,
    versionId: version.id,
  });
  return (
    <section aria-label={datasetParentsText.parentHistory}>
      <div className="section-heading">
        <h3>{datasetParentsText.parentHistory}</h3>
        {canEdit && (
          <button className="button small" onClick={() => setOpen(true)}>
            {datasetParentsText.addParents}
          </button>
        )}
      </div>
      <p className="muted">{datasetParentsText.parentHistoryHint}</p>
      <Resource query={history}>
        {(page) =>
          page.items.length ? (
            <DataTable
              items={page.items}
              rowKey={(addition) => addition.id}
              columns={[
                {
                  key: 'parent',
                  label: datasetParentsText.parentVersion,
                  render: (addition) => (
                    <DatasetVersionNameLinks
                      projectId={version.projectId}
                      versionIds={[addition.parentDatasetVersionId]}
                    />
                  ),
                },
                {
                  key: 'reason',
                  label: datasetParentsText.reason,
                  render: (addition) => addition.reason,
                },
                {
                  key: 'evidence',
                  label: datasetParentsText.evidenceColumn,
                  render: (addition) => <JsonDetails value={addition.evidence} />,
                },
                {
                  key: 'by',
                  label: datasetParentsText.createdBy,
                  render: (addition) => addition.createdByName,
                },
                {
                  key: 'at',
                  label: datasetParentsText.createdAt,
                  render: (addition) => formatDate(addition.createdAt),
                },
              ]}
            />
          ) : (
            <p className="muted">{datasetParentsText.parentHistoryEmpty}</p>
          )
        }
      </Resource>
      {open && (
        <DatasetParentAdditionDialog
          version={version}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            history.reload();
            onSaved();
          }}
        />
      )}
    </section>
  );
}
