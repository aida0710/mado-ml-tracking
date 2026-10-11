import { text } from '../i18n/catalog';

/**
 * The 変更 and 外す buttons of a member's direct grant or a group binding. The last admin grant
 * keeps them disabled with the reason beside them, so nobody presses them only to be refused.
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
