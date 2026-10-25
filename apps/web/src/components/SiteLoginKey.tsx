import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { SiteKey } from '@mmt/contracts';
import { siteComputersApi } from '../api/siteComputers';
import { useMutation } from '../hooks/useMutation';
import { ConfirmDialog } from './ConfirmDialog';
import { CopyableValue } from './CopyableValue';
import { ErrorNotice } from './Feedback';
import { DetailsList } from './JsonDetails';
import { formatDate } from '../lib/format';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { siteComputersTextTemplates, siteKeyStatusLabels } from '../i18n/siteComputers';

/**
 * siteへのログインのためにランチャーが作った鍵。アカウントのauthorized_keysに足す公開鍵、または、
 * ランチャーがまだ作っていなければその状態と依頼した日時。作り直すと今の鍵を失効させ、ランチャーに
 * 新しい鍵を頼む。まだ鍵が無ければ、依頼に確認は要らない。
 */
export function SiteLoginKey({
  targetId,
  siteKey,
  personal,
  accountName,
  onRequested,
}: {
  targetId: string;
  siteKey: SiteKey | null;
  /** 自分のアカウントのための自分の鍵。そうでなければ共有アカウントの鍵。 */
  personal: boolean;
  accountName: string;
  onRequested: () => void;
}) {
  useLocale();
  const [isConfirming, setConfirming] = useState(false);
  const mutation = useMutation();
  const rotate = () => siteComputersApi.rotateKey(targetId, { personal });
  // 作り直しは使用中の鍵を失効させるので先に確かめる。最初の依頼では失うものが無い。
  const requestKey = () => {
    if (siteKey) {
      setConfirming(true);
      return;
    }
    void mutation.run(rotate).then((requested) => {
      if (requested) onRequested();
    });
  };
  const keyHint = personal
    ? siteComputersTextTemplates.sitePersonalKeyHint(accountName)
    : siteComputersTextTemplates.siteSharedKeyHint(accountName);
  return (
    <div className="site-login-key">
      {siteKey?.publicKey ? (
        <>
          <p>{keyHint}</p>
          <CopyableValue value={siteKey.publicKey} />
          <DetailsList
            entries={[
              [
                text.siteKeyFingerprint,
                siteKey.fingerprint && <span className="mono">{siteKey.fingerprint}</span>,
              ],
              [text.siteKeyStatus, siteKeyStatusLabels[siteKey.status]],
              [text.siteKeyReadyAt, formatDate(siteKey.readyAt)],
            ]}
          />
        </>
      ) : siteKey ? (
        <>
          <p className="notice">{text.siteKeyRequested}</p>
          <DetailsList
            entries={[
              [text.siteKeyStatus, siteKeyStatusLabels[siteKey.status]],
              [text.siteKeyRequestedAt, formatDate(siteKey.requestedAt)],
            ]}
          />
        </>
      ) : (
        <p className="notice">{text.siteKeyNone}</p>
      )}
      <ErrorNotice message={mutation.error} />
      <div className="site-computer-actions">
        <button
          type="button"
          className="button small"
          disabled={mutation.pending}
          onClick={requestKey}
        >
          <KeyRound size={14} />
          {siteKey ? text.siteKeyRotate : text.siteKeyRequest}
        </button>
      </div>
      {isConfirming && (
        <ConfirmDialog
          title={text.siteKeyRotate}
          message={text.siteKeyRotateConfirm}
          confirmLabel={text.siteKeyRotate}
          destructive
          onConfirm={rotate}
          onConfirmed={() => {
            setConfirming(false);
            onRequested();
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
