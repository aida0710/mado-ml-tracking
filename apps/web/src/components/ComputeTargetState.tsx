import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * コンピュータが新しいJobを受け付けるか。自動投入のsiteなら、ランチャーの状態も添える
 * （lib/computeTargetOverview.launcherStatusLabel）。
 */
export function ComputeTargetState({
  enabled,
  launcherStatus = null,
}: {
  enabled: boolean;
  launcherStatus?: string | null;
}) {
  useLocale();
  return (
    <span className="badge-group">
      <span className={`status-badge ${enabled ? 'status-success' : 'status-neutral'}`}>
        {enabled ? text.computerEnabled : text.computerDisabled}
      </span>
      {launcherStatus && <span className="muted">{launcherStatus}</span>}
    </span>
  );
}
