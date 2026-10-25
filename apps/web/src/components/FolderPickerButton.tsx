import { FolderUp } from 'lucide-react';
import { sourcesFromFileList, type UploadSource } from '../lib/droppedFiles';

// 通常のボタンと小さいボタンのアイコンの大きさ。
const ICON_SIZE = { regular: 15, small: 14 } as const;

/**
 * ブラウザのフォルダ選択を開き、選んだフォルダのファイルを渡すボタン。選ぶたびにinputを空に
 * するので、同じフォルダをもう一度選んでも再び知らせる。
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
  /** ファイルを含むフォルダのときだけ呼ぶ。 */
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
        // 標準でないフォルダ選択の属性には、Reactに型付きのpropが無い。
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
