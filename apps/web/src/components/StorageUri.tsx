import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { DataCatalogReference } from '@mmt/contracts';
import {
  acceptsStorageConnection,
  dataCatalogStorageUrlOf,
  isStorageConnectionMissing,
} from '../lib/dataCatalogStorage';
import { StorageConnectionDialog } from '../dialogs/StorageConnectionDialog';
import { useLocale } from '../i18n/useLocale';
import { pluginsText } from '../i18n/plugins';

/**
 * データや重みの置き場所のURI。ストレージ接続を登録してあるものには、mado S3 Data Catalogの
 * その場所の画面へのリンクを添える。登録してあるIDが今の一覧に無ければ、リンクの代わりに
 * 見つからないと知らせる。`edit`を渡すと、ストレージ接続をその場で付け替えられる。
 */
export function StorageUri({
  uri,
  storageConnectionId,
  dataCatalog,
  edit,
}: {
  uri: string;
  storageConnectionId: string | null;
  dataCatalog: DataCatalogReference;
  /** 編集できる人にだけ渡す。`save`のnullは外す。 */
  edit?: { save: (storageConnectionId: string | null) => Promise<unknown>; onSaved: () => void };
}) {
  useLocale();
  const [editing, setEditing] = useState(false);
  const dataCatalogUrl = dataCatalogStorageUrlOf(dataCatalog, { uri, storageConnectionId });
  const isMissing = isStorageConnectionMissing(dataCatalog, storageConnectionId);
  // 付け替えられるのは`s3://`だけ。見つからないIDは、URIの形にかかわらず外せるようにする。
  const canEdit = edit !== undefined && (acceptsStorageConnection(dataCatalog, uri) || isMissing);
  return (
    <span className="storage-uri">
      <span className="mono break-word">{uri}</span>
      {dataCatalogUrl && (
        <a className="storage-uri-link" href={dataCatalogUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={14} aria-hidden="true" />
          {pluginsText.openInDataCatalog}
        </a>
      )}
      {isMissing && (
        <span className="storage-uri-missing">{pluginsText.storageConnectionNotFound}</span>
      )}
      {canEdit && (
        <button type="button" className="link-button storage-uri-link" onClick={() => setEditing(true)}>
          {storageConnectionId
            ? pluginsText.changeStorageConnection
            : pluginsText.setStorageConnection}
        </button>
      )}
      {editing && edit && (
        <StorageConnectionDialog
          dataCatalog={dataCatalog}
          storageConnectionId={storageConnectionId}
          save={edit.save}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            edit.onSaved();
          }}
        />
      )}
    </span>
  );
}
