import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * メンバーへの直接付与か、groupへの付与の「変更」と「外す」のボタン。最後のAdminの付与では理由を
 * 横に添えて無効のままにし、押してから断られることが無いようにする。
 */
export function AccessGrantActions({
  isLastAdmin,
  onEdit,
  onRemove,
}: {
  isLastAdmin: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  useLocale();
  return (
    <div className="access-actions">
      <button className="button small" disabled={isLastAdmin} onClick={onEdit}>
        {text.edit}
      </button>
      <button className="button small danger" disabled={isLastAdmin} onClick={onRemove}>
        {text.remove}
      </button>
      {isLastAdmin && (
        <span className="muted access-locked-reason">{text.lastProjectAdminLocked}</span>
      )}
    </div>
  );
}
