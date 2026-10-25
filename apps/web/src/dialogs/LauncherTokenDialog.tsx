import { useId } from 'react';
import type { LauncherCreated } from '@mmt/contracts';
import { Dialog } from '../components/Dialog';
import { CopyButton } from '../components/CopyButton';
import { CodeSnippet } from '../components/CodeSnippet';
import { buildLauncherConfigExample } from '../lib/launcherConfig';
import { buildLauncherStartCommands } from '../lib/launcherStartCommands';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { launchersTextTemplates } from '../i18n/launchers';

/**
 * ランチャーの新しいtokenを一度だけ見せる。APIはこの応答でしか返さない。launcher.tomlはtokenを
 * 置くファイルを指すので、例そのものにはtokenを書かない。その下のコマンドで、そのファイルを使う
 * ランチャーをインストールして起動する。
 */
export function LauncherTokenDialog({
  issued,
  onClose,
}: {
  issued: LauncherCreated;
  onClose: () => void;
}) {
  useLocale();
  const tokenId = useId();
  const config = buildLauncherConfigExample({
    apiUrl: window.location.origin,
    launcherName: issued.launcher.name,
  });
  return (
    <Dialog title={launchersTextTemplates.launcherTokenTitle(issued.launcher.name)} onClose={onClose} size="wide">
      <p className="notice">{text.launcherTokenOnce}</p>
      <div className="field">
        <label htmlFor={tokenId}>{text.launcherTokenValue}</label>
        <input
          id={tokenId}
          className="mono"
          readOnly
          value={issued.token}
          autoComplete="off"
          spellCheck={false}
          onFocus={(event) => event.target.select()}
        />
        <div>
          <CopyButton value={issued.token} />
        </div>
      </div>
      <div className="field">
        <span>{text.launcherConfigExample}</span>
        <p className="muted">{text.launcherConfigExampleHint}</p>
        <pre className="json-view" data-testid="launcher-config-example">
          {config}
        </pre>
        <div>
          <CopyButton value={config} />
        </div>
      </div>
      <div className="field">
        <span>{text.launcherStart}</span>
        <p className="muted">{text.launcherStartHint}</p>
        <CodeSnippet label={text.launcherStartCommands} code={buildLauncherStartCommands()} />
      </div>
      <footer>
        <button className="button primary" onClick={onClose}>
          {text.close}
        </button>
      </footer>
    </Dialog>
  );
}
