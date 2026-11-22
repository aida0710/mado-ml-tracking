import type { DataCatalogReference } from '@mmt/contracts';
import { FormDialog } from '../components/FormDialog';
import { getFieldValue } from '../lib/formValues';
import { storageConnectionOptions } from '../lib/dataCatalogStorage';
import { useLocale } from '../i18n/useLocale';
import { pluginsText } from '../i18n/plugins';

/** 登録済みのバージョンの、mado S3 Data Catalogのストレージ接続を付ける・直す・外す。 */
export function StorageConnectionDialog({
  dataCatalog,
  storageConnectionId,
  save,
  onClose,
  onSaved,
}: {
  dataCatalog: DataCatalogReference;
  /** 今バージョンに登録してあるID。無ければnull。 */
  storageConnectionId: string | null;
  /** nullは外す。 */
  save: (storageConnectionId: string | null) => Promise<unknown>;
  onClose: () => void;
  onSaved: () => void;
}) {
  useLocale();
  const current = storageConnectionId ?? '';
  return (
    <FormDialog
      title={
        storageConnectionId ? pluginsText.changeStorageConnection : pluginsText.setStorageConnection
      }
      onClose={onClose}
      onSaved={onSaved}
      fields={[
        {
          name: 'storageConnectionId',
          label: pluginsText.storageConnection,
          type: 'select',
          defaultValue: current,
          options: storageConnectionOptions(
            dataCatalog.storageConnections,
            {
              unset: pluginsText.noStorageConnection,
              notFound: pluginsText.storageConnectionNotFound,
            },
            current,
          ),
          hint: pluginsText.storageConnectionHint,
        },
      ]}
      onSubmit={(values) => save(getFieldValue(values, 'storageConnectionId') || null)}
    />
  );
}
