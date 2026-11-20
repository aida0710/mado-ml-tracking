import { useState } from 'react';
import type { DataCatalogConnection, DataCatalogPlugin } from '@mmt/contracts';
import { dataCatalogPluginApi } from '../../api/dataCatalogPlugin';
import { DataCatalogConnectionDialog } from '../../dialogs/DataCatalogConnectionDialog';
import { useMutation } from '../../hooks/useMutation';
import {
  canReadCapacity,
  formatAccessTokenExpiry,
  formatAccessTokenPermissions,
} from '../../lib/dataCatalogAccessTokenGrantText';
import { storageConnectionLabel } from '../../lib/dataCatalogStorage';
import { formatDate } from '../../lib/format';
import { formatList } from '../../i18n/textJoining';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorNotice } from '../Feedback';
import { DetailsList } from '../JsonDetails';
import { DataCatalogCapacity } from './DataCatalogCapacity';
import { useLocale } from '../../i18n/useLocale';
import { pluginsText } from '../../i18n/plugins';

type OpenDialog = 'connect' | 'disconnect';

/**
 * Pluginsの画面の、mado S3 Data Catalogの区画。未接続なら接続のボタンだけを出し、接続済みなら
 * 接続の内容と、容量を出す。
 */
export function DataCatalogPluginSection({
  plugin,
  onChanged,
}: {
  plugin: DataCatalogPlugin;
  /** 接続・確認・解除のあと。画面は読み込み直した内容に従う。 */
  onChanged: () => void;
}) {
  useLocale();
  const { connection } = plugin;
  const [openDialog, setOpenDialog] = useState<OpenDialog | null>(null);
  // 直前の操作が接続の確認で、成功したか。次の操作を始めると消える。
  const [showsCheckSuccess, setShowsCheckSuccess] = useState(false);
  const check = useMutation();
  const checkConnection = (saved: DataCatalogConnection) => {
    setShowsCheckSuccess(false);
    void check.run(async () => {
      await dataCatalogPluginApi.connect({ url: saved.url });
      setShowsCheckSuccess(true);
      onChanged();
    });
  };
  const openDialogFor = (dialog: OpenDialog) => {
    setShowsCheckSuccess(false);
    check.clearError();
    setOpenDialog(dialog);
  };
  const closeDialogAfterChange = () => {
    setOpenDialog(null);
    onChanged();
  };
  return (
    <section className="plugin-section" aria-label={pluginsText.dataCatalog}>
      <div className="section-heading">
        <h2>{pluginsText.dataCatalog}</h2>
        <span className={`status-badge ${connection ? 'status-success' : ''}`}>
          {connection ? pluginsText.connected : pluginsText.notConnected}
        </span>
      </div>
      <p className="muted">{pluginsText.dataCatalogAbout}</p>
      {!plugin.secretStorageAvailable && (
        <p className="notice warning">{pluginsText.secretStorageUnavailable}</p>
      )}
      {connection ? (
        <>
          <DetailsList
            entries={[
              [
                pluginsText.url,
                <a href={connection.url} target="_blank" rel="noreferrer">
                  {connection.url}
                </a>,
              ],
              [pluginsText.accessTokenName, connection.accessTokenGrant.name],
              [
                pluginsText.accessTokenPermissions,
                formatAccessTokenPermissions(connection.accessTokenGrant),
              ],
              [
                pluginsText.accessTokenExpiresAt,
                formatAccessTokenExpiry(connection.accessTokenGrant),
              ],
              [
                pluginsText.storageConnections,
                connection.storageConnections.length
                  ? formatList(connection.storageConnections.map(storageConnectionLabel))
                  : pluginsText.noStorageConnections,
              ],
              [pluginsText.checkedAt, formatDate(connection.checkedAt)],
            ]}
          />
          <div className="section-actions plugin-actions">
            <button
              className="button small"
              disabled={check.pending}
              onClick={() => checkConnection(connection)}
            >
              {pluginsText.checkConnection}
            </button>
            <button
              className="button small"
              disabled={check.pending}
              onClick={() => openDialogFor('connect')}
            >
              {pluginsText.changeConnection}
            </button>
            <button
              className="button small danger"
              disabled={check.pending}
              onClick={() => openDialogFor('disconnect')}
            >
              {pluginsText.disconnect}
            </button>
          </div>
          <ErrorNotice message={check.error} />
          {showsCheckSuccess && (
            <p className="notice success" role="status">
              {pluginsText.connectionChecked}
            </p>
          )}
          {canReadCapacity(connection.accessTokenGrant) ? (
            // 確かめ直すたびに、新しい接続の内容で容量を読み直す。
            <DataCatalogCapacity key={connection.checkedAt} />
          ) : (
            <p className="notice warning">{pluginsText.capacityNotPermitted}</p>
          )}
        </>
      ) : (
        <div className="section-actions plugin-actions">
          <button
            className="button primary"
            disabled={!plugin.secretStorageAvailable}
            onClick={() => openDialogFor('connect')}
          >
            {pluginsText.connect}
          </button>
        </div>
      )}
      {openDialog === 'connect' && (
        <DataCatalogConnectionDialog
          connection={connection}
          onClose={() => setOpenDialog(null)}
          onConnected={closeDialogAfterChange}
        />
      )}
      {openDialog === 'disconnect' && (
        <ConfirmDialog
          title={pluginsText.disconnect}
          message={pluginsText.disconnectMessage}
          confirmLabel={pluginsText.disconnect}
          destructive
          onConfirm={dataCatalogPluginApi.disconnect}
          onConfirmed={closeDialogAfterChange}
          onClose={() => setOpenDialog(null)}
        />
      )}
    </section>
  );
}
