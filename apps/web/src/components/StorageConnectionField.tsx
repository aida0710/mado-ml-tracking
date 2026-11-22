import type { DataCatalogStorageConnection } from '@mmt/contracts';
import { storageConnectionOptions } from '../lib/dataCatalogStorage';
import { LabeledField } from './LabeledField';
import { useLocale } from '../i18n/useLocale';
import { pluginsText } from '../i18n/plugins';

/** `s3://`のURIがある、mado S3 Data Catalogのストレージ接続を選ぶ欄。選ばなくても保存できる。 */
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
    <LabeledField label={pluginsText.storageConnection} hint={pluginsText.storageConnectionHint}>
      {(id, hintId) => (
        <select
          id={id}
          value={value}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.value)}
        >
          {storageConnectionOptions(
            storageConnections,
            { unset: pluginsText.noStorageConnection, notFound: pluginsText.storageConnectionNotFound },
            value,
          ).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </LabeledField>
  );
}
