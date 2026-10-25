import { RefreshCw } from 'lucide-react';
import { useAuditEvents } from '../../hooks/useAuditEvents';
import { AuditEventLog } from '../AuditEventLog';
import { SettingsPageHeader } from '../SettingsPageHeader';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/**
 * 全体管理の「監査ログ」。ログイン、ユーザーの管理、保存先の変更など、どのProjectにも属さない
 * イベントも含めてすべて出す。これらはどのProjectの設定画面にも出ない。
 */
export function AuditEventsPanel() {
  useLocale();
  const audit = useAuditEvents('global');
  return (
    <section className="admin-audit">
      <SettingsPageHeader
        section="audit"
        actions={
          <button className="icon-button" aria-label={text.refresh} onClick={audit.reload}>
            <RefreshCw size={17} />
          </button>
        }
      />
      <p className="muted">{text.adminAuditDescription}</p>
      <AuditEventLog audit={audit} showProject />
    </section>
  );
}
