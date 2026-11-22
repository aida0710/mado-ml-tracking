import type { Dataset, DatasetVersion } from '@mmt/contracts';
import { useProject } from '../hooks/useProject';
import { useExecutionCatalog } from '../hooks/useExecutionCatalog';
import { registryApi } from '../api/registry';
import { QueryDialog } from '../components/QueryDialog';
import { DataCatalogUrlSuggestion } from '../components/DataCatalogUrlSuggestion';
import { ErrorNotice } from '../components/Feedback';
import { FormDialog } from '../components/FormDialog';
import { DatasetFolderVersionDialog } from './DatasetFolderVersionDialog';
import { buildCatalogOptions, withEmptyOption } from '../lib/catalogOptions';
import { datasetParentChoices } from '../lib/datasetParentChoices';
import {
  getFieldValue,
  parseJsonObject,
  getOptionalValue,
  getSelectedValues,
} from '../lib/formValues';
import { acceptsStorageConnection, storageConnectionOptions } from '../lib/dataCatalogStorage';
import { useDataCatalogReference } from '../hooks/useDataCatalogReference';
import { useLocale } from '../i18n/useLocale';
import { pluginsText } from '../i18n/plugins';
import { text } from '../i18n/catalog';

/** 'reference'はuriとdigestを登録し、'folder'はフォルダをアップロードしてそのArtifactを並べる。 */
export type DatasetVersionSource = 'reference' | 'folder';

export function DatasetVersionDialog({
  dataset,
  source,
  onClose,
  onSaved,
}: {
  dataset: Dataset;
  source: DatasetVersionSource;
  onClose: () => void;
  onSaved: (version: DatasetVersion) => void;
}) {
  useLocale();
  const { project } = useProject();
  const catalog = useExecutionCatalog(project.id);
  const dataCatalogQuery = useDataCatalogReference(project.id);
  const dataCatalog = dataCatalogQuery.reference;
  const title = `${dataset.name} · ${source === 'folder' ? text.datasetVersionFromFolder : text.newVersion}`;
  return (
    <QueryDialog title={title} onClose={onClose} query={catalog}>
      {(choices) => {
        const parents = datasetParentChoices(choices.datasetVersions, dataset.id);
        return source === 'folder' ? (
          <DatasetFolderVersionDialog
            title={title}
            dataset={dataset}
            parentOptions={parents.options}
            defaultParentIds={parents.defaultParentIds}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : (
          <FormDialog
            title={title}
            onClose={onClose}
            onSaved={onSaved}
            fields={[
              { name: 'version', label: text.version, required: true },
              {
                name: 'uri',
                label: text.uri,
                required: true,
                placeholder: text.datasetVersionUriPlaceholder,
                hint: text.datasetVersionUriHint,
                notice: (values, onChange) => (
                  <>
                    <ErrorNotice
                      message={dataCatalogQuery.error}
                      retry={dataCatalogQuery.reload}
                    />
                    <DataCatalogUrlSuggestion
                      dataCatalog={dataCatalog}
                      value={getFieldValue(values, 'uri')}
                      onAccept={({ uri, storageConnectionId }) =>
                        onChange({ ...values, uri, storageConnectionId })
                      }
                    />
                  </>
                ),
              },
              {
                name: 'storageConnectionId',
                label: pluginsText.storageConnection,
                type: 'select',
                options: storageConnectionOptions(dataCatalog.storageConnections, {
                  unset: pluginsText.noStorageConnection,
                  notFound: pluginsText.storageConnectionNotFound,
                }),
                hint: pluginsText.storageConnectionHint,
                visible: (values) =>
                  acceptsStorageConnection(dataCatalog, getFieldValue(values, 'uri')),
              },
              {
                name: 'digest',
                label: text.digest,
                required: true,
                placeholder: text.datasetVersionDigestPlaceholder,
                hint: text.datasetVersionDigestHint,
              },
              {
                name: 'parents',
                label: text.parents,
                type: 'checkboxes',
                options: parents.options,
                defaultValue: parents.defaultParentIds,
                hint: text.datasetParentsHint,
                emptyText: text.datasetParentsEmpty,
              },
              {
                name: 'sourceRunId',
                label: text.sourceRun,
                type: 'select',
                options: withEmptyOption(buildCatalogOptions(choices).runs),
              },
              { name: 'schema', label: text.schema, type: 'textarea', defaultValue: '{}' },
              { name: 'metadata', label: text.metadata, type: 'textarea', defaultValue: '{}' },
            ]}
            onSubmit={(values) =>
              registryApi.createDatasetVersion(project.id, dataset.id, {
                version: getFieldValue(values, 'version'),
                uri: getFieldValue(values, 'uri'),
                // 未設定と、URIをs3://でないものに変えたあとに残った選択は送らない。
                ...(acceptsStorageConnection(dataCatalog, getFieldValue(values, 'uri')) &&
                getFieldValue(values, 'storageConnectionId')
                  ? { dataCatalogStorageConnectionId: getFieldValue(values, 'storageConnectionId') }
                  : {}),
                digest: getFieldValue(values, 'digest'),
                parentDatasetVersionIds: getSelectedValues(values, 'parents'),
                sourceRunId: getOptionalValue(values, 'sourceRunId'),
                schema: parseJsonObject(getFieldValue(values, 'schema')),
                metadata: parseJsonObject(getFieldValue(values, 'metadata')),
              })
            }
          />
        );
      }}
    </QueryDialog>
  );
}
