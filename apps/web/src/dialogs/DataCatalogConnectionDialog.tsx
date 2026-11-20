import { useState } from 'react';
import type { DataCatalogConnection, DataCatalogPlugin } from '@mmt/contracts';
import { dataCatalogPluginApi } from '../api/dataCatalogPlugin';
import { Dialog } from '../components/Dialog';
import { ErrorNotice } from '../components/Feedback';
import { FormFields } from '../components/FormFields';
import { useMutation } from '../hooks/useMutation';
import { getFieldValue } from '../lib/formValues';
import type { FormValues } from '../types/form';
import { useLocale } from '../i18n/useLocale';
import { pluginsText } from '../i18n/plugins';
import { text } from '../i18n/catalog';

/**
 * mado S3 Data CatalogのURLとアクセストークンを入れて接続する。APIが接続を確かめ、通ったときだけ
 * 保存するので、閉じたときには使える状態になっている。
 */
export function DataCatalogConnectionDialog({
  connection,
  onClose,
  onConnected,
}: {
  /** 今の接続。変更のときに渡す。 */
  connection: DataCatalogConnection | null;
  onClose: () => void;
  onConnected: (plugin: DataCatalogPlugin) => void;
}) {
  useLocale();
  const [values, setValues] = useState<FormValues>({ url: connection?.url ?? '', accessToken: '' });
  const mutation = useMutation();
  const connect = async () => {
    const connected = await mutation.run(() =>
      dataCatalogPluginApi.connect({
        url: getFieldValue(values, 'url').trim(),
        // 空欄は「保存済みのtokenを使う」の意味なので、送らない。
        accessToken: getFieldValue(values, 'accessToken') || undefined,
      }),
    );
    if (connected) onConnected(connected);
  };
  return (
    <Dialog
      title={connection ? pluginsText.changeConnection : pluginsText.connect}
      onClose={onClose}
      dismissible={!mutation.pending}
    >
      <form
        data-testid="data-catalog-connection-form"
        onSubmit={(event) => {
          event.preventDefault();
          void connect();
        }}
      >
        <p className="muted">{pluginsText.connectHint}</p>
        <fieldset disabled={mutation.pending}>
          <FormFields
            fields={[
              {
                name: 'url',
                label: pluginsText.url,
                type: 'url',
                required: true,
                hint: pluginsText.urlHint,
              },
              {
                name: 'accessToken',
                label: pluginsText.accessToken,
                type: 'password',
                required: !connection,
                hint: connection ? pluginsText.savedAccessTokenHint : pluginsText.accessTokenHint,
              },
            ]}
            values={values}
            onChange={(next) => {
              setValues(next);
              mutation.clearError();
            }}
          />
        </fieldset>
        <ErrorNotice message={mutation.error} />
        <footer>
          <button type="button" className="button" disabled={mutation.pending} onClick={onClose}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={mutation.pending}>
            {mutation.pending ? text.loading : pluginsText.connectSubmit}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
