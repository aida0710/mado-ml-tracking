import type { StorageBackend } from '@mmt/contracts';
import { Lock } from 'lucide-react';
import { ResponsiveTable } from '../ResponsiveTable';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/** 保存先の一覧と、全体管理者がそれぞれに対して行える操作。 */
export function StorageBackendsTable({
  backends,
  defaultBackend,
  testingBackend,
  onTest,
  onEdit,
  onMakeDefault,
}: {
  backends: StorageBackend[];
  defaultBackend: string;
  /** 接続テストを実行中の保存先。そのボタンに待ちを表示する。 */
  testingBackend: string | null;
  onTest: (backend: StorageBackend) => void;
  onEdit: (backend: StorageBackend) => void;
  onMakeDefault: (backend: StorageBackend) => void;
}) {
  useLocale();
  return (
    <ResponsiveTable
      rows={backends}
      rowKey={(backend) => backend.name}
      empty={text.storageNoBackends}
      columns={[
        {
          key: 'name',
          priority: 'primary',
          header: text.name,
          render: (backend) => (
            <span className="storage-name">
              <strong>{backend.name}</strong>
              {backend.name === defaultBackend && (
                <span className="status-badge status-accent">{text.storageDefaultMark}</span>
              )}
            </span>
          ),
        },
        {
          key: 'kind',
          priority: 'primary',
          header: text.storageBackendKind,
          render: (backend) => text[backend.kind],
        },
        {
          key: 'location',
          priority: 'secondary',
          header: text.storageLocation,
          className: 'storage-location',
          render: (backend) => <code>{describeLocation(backend)}</code>,
        },
        {
          key: 'signature',
          priority: 'secondary',
          header: text.storageSignature,
          render: (backend) => (backend.kind === 's3' ? backend.signatureVersion : ''),
        },
        {
          key: 'state',
          priority: 'secondary',
          header: text.status,
          render: (backend) => (backend.enabled ? text.enabled : text.disabled),
        },
        {
          key: 'source',
          priority: 'secondary',
          header: text.storageSource,
          render: (backend) =>
            backend.source === 'environment' ? (
              <span className="storage-readonly" title={text.storageEnvironmentReadOnly}>
                <Lock size={12} aria-hidden="true" />
                {text.storageSourceEnvironment}
              </span>
            ) : (
              text.storageSourceDatabase
            ),
        },
        {
          key: 'actions',
          priority: 'secondary',
          header: <span className="sr-only">{text.edit}</span>,
          className: 'storage-actions',
          render: (backend) => (
            <span className="storage-row-actions">
              <button
                className="button small"
                disabled={testingBackend !== null}
                onClick={() => onTest(backend)}
              >
                {testingBackend === backend.name ? text.loading : text.storageTest}
              </button>
              {backend.source === 'database' && (
                <button className="button small" onClick={() => onEdit(backend)}>
                  {text.edit}
                </button>
              )}
              {backend.enabled && backend.name !== defaultBackend && (
                <button className="button small" onClick={() => onMakeDefault(backend)}>
                  {text.storageMakeDefault}
                </button>
              )}
            </span>
          ),
        },
      ]}
    />
  );
}

function describeLocation(backend: StorageBackend): string {
  if (backend.kind === 'filesystem') return backend.rootPath ?? '';
  const bucketPath = [backend.bucket, backend.prefix].filter(Boolean).join('/');
  return backend.endpoint ? `${backend.endpoint} ${bucketPath}` : bucketPath;
}
