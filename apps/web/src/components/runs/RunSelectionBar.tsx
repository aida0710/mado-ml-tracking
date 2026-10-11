import { useLocale } from '../../i18n/useLocale';
import { useNavigate } from 'react-router-dom';
import { text, textTemplates } from '../../i18n/catalog';

export function RunSelectionBar({
  projectId,
  selectedIds,
  canEdit,
  onAddTag,
  onClear,
}: {
  projectId: string;
  selectedIds: string[];
  canEdit: boolean;
  onAddTag: () => void;
  onClear: () => void;
}) {
  useLocale();
  const navigate = useNavigate();
  if (!selectedIds.length) return null;
  return (
    <div className="selection-bar">
      <span>
        {textTemplates.runCount(selectedIds.length)} · {text.selectedRuns}
      </span>
      <div>
        <button
          disabled={selectedIds.length < 2}
          onClick={() => navigate(`/projects/${projectId}/compare?runs=${selectedIds.join(',')}`)}
        >
          {text.compare}
        </button>
        {canEdit && <button onClick={onAddTag}>{text.addTag}</button>}
        <button onClick={onClear}>{text.clearSelection}</button>
      </div>
    </div>
  );
}
