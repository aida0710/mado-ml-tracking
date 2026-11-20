import type { DataCatalogStorageConnection } from '@mmt/contracts';
import { storageConnectionLabel } from '../lib/dataCatalogStorage';
import { LabeledField } from './LabeledField';
import { useLocale } from '../i18n/useLocale';
import { pluginsText } from '../i18n/plugins';

/** `s3://`のURIがある、mado S3 Data Catalogのストレージ接続を選ぶ欄。選ばないと保存できない。 */
export function StorageConnectionField({
  storageConnections,
  value,
  onChange,
}: {
  storageConnections: DataCatalogStorageConnection[];
  value: string;
  onChange: (storageConnectionId: string) => void;
}) {
  useLocale();
  return (
    <LabeledField label={pluginsText.storageConnection} hint={pluginsText.storageConnectionHint} required>
      {(id, hintId) => (
        <select
          id={id}
          value={value}
          required
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{pluginsText.chooseStorageConnection}</option>
          {storageConnections.map((storageConnection) => (
            <option key={storageConnection.id} value={storageConnection.id}>
              {storageConnectionLabel(storageConnection)}
            </option>
          ))}
        </select>
      )}
    </LabeledField>
  );
}
