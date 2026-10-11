import { FolderUp } from 'lucide-react';
import { sourcesFromFileList, type UploadSource } from '../lib/droppedFiles';

// The icon sizes of the regular and the small button.
const ICON_SIZE = { regular: 15, small: 14 } as const;

/**
 * A button that opens the browser's folder picker and hands over the files of the chosen folder.
 * The input is emptied after each choice, so choosing the same folder again is reported again.
 */
export function FolderPickerButton({
  label,
  size = 'regular',
  disabled = false,
  onChoose,
}: {
  label: string;
  size?: keyof typeof ICON_SIZE;
  disabled?: boolean;
  /** Called only with a folder that holds files. */
  onChoose: (sources: UploadSource[]) => void;
}) {
  return (
    <label className={size === 'small' ? 'button small' : 'button'} aria-disabled={disabled || undefined}>
      <FolderUp size={ICON_SIZE[size]} />
      {label}
      <input
        type="file"
        className="sr-only"
        disabled={disabled}
        // React has no typed prop for the non-standard folder picker attribute.
        ref={(input) => input?.setAttribute('webkitdirectory', '')}
        onChange={(event) => {
          const sources = sourcesFromFileList(event.target.files);
          event.target.value = '';
          if (sources.length > 0) onChoose(sources);
        }}
      />
    </label>
  );
}
