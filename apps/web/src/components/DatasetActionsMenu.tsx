import { useId, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { Dataset } from '@mmt/contracts';
import { registryApi } from '../api/registry';
import { usePopover } from '../hooks/usePopover';
import { ConfirmDialog } from './ConfirmDialog';
import { FormDialog } from './FormDialog';
import { getFieldValue } from '../lib/formValues';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';

/**
 * The ⋯ menu of a dataset for editors: change its description, archive it (new Runs and launch
 * templates can no longer take its versions) or bring it back. The name is not changed here.
 */
export function DatasetActionsMenu({
  dataset,
  onChanged,
}: {
  dataset: Dataset;
  onChanged: (dataset: Dataset) => void;
}) {
  useLocale();
  const menuId = useId();
  const { container: popoverContainer, isOpen, toggle, close } = usePopover();
  const [dialog, setDialog] = useState<'description' | 'archive' | 'unarchive' | null>(null);
  const isArchived = dataset.archivedAt !== null;
  function choose(next: typeof dialog) {
    close();
    setDialog(next);
  }
  return (
    <div className="artifact-actions" ref={popoverContainer}>
      <button
        type="button"
        className="icon-button"
        aria-label={text.datasetActions}
        title={text.datasetActions}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={toggle}
      >
        <MoreHorizontal size={17} />
      </button>
      {isOpen && (
        <div className="artifact-actions-popover" id={menuId} role="menu">
          <button type="button" role="menuitem" onClick={() => choose('description')}>
            {text.datasetEditDescription}
          </button>
          <button type="button" role="menuitem" onClick={() => choose(isArchived ? 'unarchive' : 'archive')}>
            {isArchived ? text.datasetUnarchive : text.datasetArchive}
          </button>
        </div>
      )}
      {dialog === 'description' && (
        <FormDialog
          title={text.datasetEditDescription}
          onClose={() => setDialog(null)}
          fields={[
            { name: 'description', label: text.description, type: 'textarea', defaultValue: dataset.description },
          ]}
          onSubmit={(values) =>
            registryApi.updateDataset(dataset.projectId, dataset.id, {
              description: getFieldValue(values, 'description'),
            })
          }
          onSaved={(updated) => {
            setDialog(null);
            onChanged(updated);
          }}
        />
      )}
      {(dialog === 'archive' || dialog === 'unarchive') && (
        <ConfirmDialog
          title={dialog === 'archive' ? text.datasetArchive : text.datasetUnarchive}
          message={
            dialog === 'archive'
              ? textTemplates.datasetArchiveMessage(dataset.name)
              : textTemplates.datasetUnarchiveMessage(dataset.name)
          }
          confirmLabel={dialog === 'archive' ? text.datasetArchive : text.datasetUnarchive}
          onConfirm={async () => {
            const updated = await registryApi.updateDataset(dataset.projectId, dataset.id, {
              archived: dialog === 'archive',
            });
            onChanged(updated);
          }}
          onConfirmed={() => setDialog(null)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
