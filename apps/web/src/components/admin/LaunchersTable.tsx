import type { Launcher } from '@mmt/contracts';
import { ResponsiveTable } from '../ResponsiveTable';
import { formatDate } from '../../lib/format';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/** ランチャーの一覧。最後の応答とtokenの先頭を出す。失効したものには操作を残さない。 */
export function LaunchersTable({
  launchers,
  onRotateToken,
  onRevoke,
}: {
  launchers: Launcher[];
  onRotateToken: (launcher: Launcher) => void;
  onRevoke: (launcher: Launcher) => void;
}) {
  useLocale();
  return (
    <ResponsiveTable
      rows={launchers}
      rowKey={(launcher) => launcher.id}
      label={text.launchers}
      empty={text.noLaunchers}
      columns={[
        { key: 'name', priority: 'primary', header: text.name, render: (launcher) => launcher.name },
        {
          key: 'status',
          priority: 'primary',
          header: text.status,
          render: (launcher) =>
            launcher.revokedAt === null ? (
              <span className="status-badge status-success">{text.launcherActive}</span>
            ) : (
              <span className="status-badge status-danger" title={formatDate(launcher.revokedAt)}>
                {text.launcherRevoked}
              </span>
            ),
        },
        {
          key: 'lastSeen',
          priority: 'secondary',
          header: text.launcherLastSeen,
          render: (launcher) =>
            launcher.lastSeenAt ? formatDate(launcher.lastSeenAt) : text.launcherNeverSeen,
        },
        {
          key: 'tokenPrefix',
          priority: 'secondary',
          header: text.launcherTokenPrefix,
          className: 'mono',
          render: (launcher) => (launcher.tokenPrefix ? `${launcher.tokenPrefix}…` : '—'),
        },
        {
          key: 'created',
          priority: 'secondary',
          header: text.launcherCreatedAt,
          render: (launcher) => formatDate(launcher.createdAt),
        },
        {
          key: 'actions',
          priority: 'secondary',
          header: text.actions,
          render: (launcher) =>
            launcher.revokedAt === null && (
              <div className="access-actions">
                <button className="button small" onClick={() => onRotateToken(launcher)}>
                  {text.launcherRotateToken}
                </button>
                <button className="button small danger" onClick={() => onRevoke(launcher)}>
                  {text.launcherRevoke}
                </button>
              </div>
            ),
        },
      ]}
    />
  );
}
