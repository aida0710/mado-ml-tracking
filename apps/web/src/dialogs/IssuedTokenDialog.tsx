import { useId } from 'react';
import { Dialog } from '../components/Dialog';
import { CopyButton } from '../components/CopyButton';
import { TokenUsageSnippet } from '../components/TokenUsageSnippet';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 発行したばかりのtokenを、この一度だけ見せる。値とそのコピーのボタン、このProjectの設定の例
 * （tokenを書き込まず、プロンプトで読み込む）。
 */
export function IssuedTokenDialog({
  title,
  projectId,
  token,
  onClose,
}: {
  title: string;
  projectId: string;
  token: string;
  onClose: () => void;
}) {
  useLocale();
  const valueId = useId();
  return (
    <Dialog title={title} onClose={onClose}>
      <p className="notice">{text.tokenOnce}</p>
      <div className="field">
        <label htmlFor={valueId}>{text.issuedTokenValue}</label>
        <div className="issued-token-value">
          <input
            id={valueId}
            className="mono"
            readOnly
            value={token}
            autoComplete="off"
            spellCheck={false}
            onFocus={(event) => event.target.select()}
          />
          <CopyButton value={token} label={text.copyIssuedToken} />
        </div>
      </div>
      <TokenUsageSnippet projectId={projectId} />
      <footer>
        <button className="button primary" onClick={onClose}>
          {text.close}
        </button>
      </footer>
    </Dialog>
  );
}
