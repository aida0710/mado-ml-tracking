import { useState } from 'react';
import type { StorageConnectionUsage } from '@mmt/contracts';
import { dataCatalogStorageApi } from '../api/dataCatalogStorage';
import { useDataCatalogReference } from '../hooks/useDataCatalogReference';
import { useQuery } from '../hooks/useQuery';
import { isStorageConnectionMissing, storageConnectionLabel } from '../lib/dataCatalogStorage';
import { StorageConnectionDialog } from '../dialogs/StorageConnectionDialog';
import { ErrorNotice, Resource } from './Feedback';
import { ResponsiveTable } from './ResponsiveTable';
import { useLocale } from '../i18n/useLocale';
import { pluginsText } from '../i18n/plugins';

/**
 * Projectの`s3://`のバージョンが、バケットごとにどのストレージ接続を持つかの一覧。編集できる人は、
 * 行ごと（バケットと今のストレージ接続の組）にまとめて付け替えられる。
 */
export function ProjectStorageConnections({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  useLocale();
  const dataCatalog = useDataCatalogReference(projectId);
  const usage = useQuery({
    key: `storage-connection-usage:${projectId}`,
    load: (signal) => dataCatalogStorageApi.storageConnectionUsage(projectId, signal),
  });
  const [editing, setEditing] = useState<StorageConnectionUsage | null>(null);
  const reference = dataCatalog.reference;
  const storageConnectionName = (storageConnectionId: string | null) => {
    if (storageConnectionId === null) return pluginsText.noStorageConnection;
    const listed = reference.storageConnections.find(
      (storageConnection) => storageConnection.id === storageConnectionId,
    );
    return listed ? storageConnectionLabel(listed) : storageConnectionId;
  };
  return (
    <section className="settings-section">
      <h2>{pluginsText.projectStorageConnections}</h2>
      <p className="muted">{pluginsText.projectStorageConnectionsAbout}</p>
      <ErrorNotice message={dataCatalog.error} retry={dataCatalog.reload} />
      {!dataCatalog.error && reference.url === null ? (
        <p className="muted">{pluginsText.projectStorageConnectionsNotConnected}</p>
      ) : (
        <Resource query={usage}>
          {({ items }) =>
            items.length ? (
              <ResponsiveTable
                rows={items}
                rowKey={(item) => `${item.bucket}\n${item.dataCatalogStorageConnectionId ?? ''}`}
                columns={[
                  {
                    key: 'bucket',
                    priority: 'primary',
                    header: pluginsText.storageBucket,
                    className: 'mono',
                    render: (item) => item.bucket,
                  },
                  {
                    key: 'storageConnection',
                    priority: 'primary',
                    header: pluginsText.storageConnection,
                    render: (item) => (
                      <span className="storage-uri">
                        {storageConnectionName(item.dataCatalogStorageConnectionId)}
                        {isStorageConnectionMissing(reference, item.dataCatalogStorageConnectionId) && (
                          <span className="storage-uri-missing">
                            {pluginsText.storageConnectionNotFound}
                          </span>
                        )}
                      </span>
                    ),
                  },
                  {
                    key: 'datasetVersions',
                    priority: 'secondary',
                    header: pluginsText.storageDatasetVersions,
                    render: (item) => item.datasetVersions,
                  },
                  {
                    key: 'modelVersions',
                    priority: 'secondary',
                    header: pluginsText.storageModelVersions,
                    render: (item) => item.modelVersions,
                  },
                  ...(canEdit
                    ? [
                        {
                          key: 'change',
                          priority: 'primary' as const,
                          header: '',
                          render: (item: StorageConnectionUsage) => (
                            <button
                              type="button"
                              className="button small"
                              onClick={() => setEditing(item)}
                            >
                              {item.dataCatalogStorageConnectionId
                                ? pluginsText.changeStorageConnection
                                : pluginsText.setStorageConnection}
                            </button>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            ) : (
              <p className="muted">{pluginsText.projectStorageConnectionsEmpty}</p>
            )
          }
        </Resource>
      )}
      {editing && (
        <StorageConnectionDialog
          dataCatalog={reference}
          storageConnectionId={editing.dataCatalogStorageConnectionId}
          save={(storageConnectionId) =>
            // 同じ値を選んで保存したときは、付け替えるものが無い。
            storageConnectionId === editing.dataCatalogStorageConnectionId
              ? Promise.resolve()
              : dataCatalogStorageApi.reassignStorageConnection(projectId, {
                  bucket: editing.bucket,
                  fromDataCatalogStorageConnectionId: editing.dataCatalogStorageConnectionId,
                  toDataCatalogStorageConnectionId: storageConnectionId,
                })
          }
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            usage.reload();
          }}
        />
      )}
    </section>
  );
}
