import { CopyButton } from './CopyButton';

/** ラベルの下に置く、実行するか貼り付ける行（シェルの設定、例のプログラム）。まとめてコピーする。 */
export function CodeSnippet({
  label,
  code,
  copyLabel,
}: {
  label: string;
  code: string;
  /** 近くに別のコピーボタンがあるときの、コピーボタンの文言。 */
  copyLabel?: string;
}) {
  return (
    <div className="code-snippet">
      <div className="code-snippet-heading">
        <span>{label}</span>
        <CopyButton value={code} label={copyLabel} />
      </div>
      {/* tabIndexで、横にスクロールする長い行にキーボードからも届くようにする。 */}
      <pre className="json-view" tabIndex={0}>
        {code}
      </pre>
    </div>
  );
}
