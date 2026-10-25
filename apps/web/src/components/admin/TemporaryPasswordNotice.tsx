import { CopyButton } from '../CopyButton';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/** 一時パスワードをコピーのボタンとともに一度だけ出す。閉じた後は二度と出さない。 */
export function TemporaryPasswordNotice({ password }: { password: string }) {
  useLocale();
  return (
    <div className="temporary-password">
      <span className="field-label">{text.temporaryPasswordTitle}</span>
      <div className="temporary-password-value">
        <code data-testid="temporary-password">{password}</code>
        <CopyButton value={password} />
      </div>
      <p className="muted">{text.temporaryPasswordOnce}</p>
    </div>
  );
}
