import { ExternalLink } from 'lucide-react';
import type { DataCatalogReference } from '@mmt/contracts';
import {
  acceptsStorageConnection,
  dataCatalogStorageUrlOf,
  isStorageConnectionMissing,
} from '../lib/dataCatalogStorage';
import { useLocale } from '../i18n/useLocale';
import { pluginsText } from '../i18n/plugins';

/**
 * データや重みの置き場所のURI。ストレージ接続を登録してあるものには、mado S3 Data Catalogの
 * その場所の画面へのリンクを添える。登録してあるIDが今の一覧に無ければ、リンクの代わりに
 * 見つからないと知らせる。`onEditStorageConnection`を渡すと、付け替えを始めるボタンを出す。
 */
export function StorageUri({
  uri,
  storageConnectionId,
  dataCatalog,
  onEditStorageConnection,
}: {
  uri: string;
  storageConnectionId: string | null;
  dataCatalog: DataCatalogReference;
  /**
   * 編集できる人にだけ渡す。付け替えのダイアログは呼び出し側が持つ。表の行は幅が変わると
   * 描き直されるので、行の中に状態を置くと開いたダイアログが閉じる。
   */
  onEditStorageConnection?: () => void;
}) {
  useLocale();
  const dataCatalogUrl = dataCatalogStorageUrlOf(dataCatalog, { uri, storageConnectionId });
  const isMissing = isStorageConnectionMissing(dataCatalog, storageConnectionId);
  // 付け替えられるのは`s3://`だけ。見つからないIDは、URIの形にかかわらず外せるようにする。
  const canEdit =
    onEditStorageConnection !== undefined &&
    (acceptsStorageConnection(dataCatalog, uri) || isMissing);
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
        <button type="button" className="link-button storage-uri-link" onClick={onEditStorageConnection}>
          {storageConnectionId
            ? pluginsText.changeStorageConnection
            : pluginsText.setStorageConnection}
        </button>
      )}
    </span>
  );
}
