import { useState } from 'react';
import type { Artifact } from '@mmt/contracts';
import { Maximize2, Minimize2 } from 'lucide-react';
import { trackingApi } from '../../api/tracking';
import { ErrorNotice } from '../Feedback';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

/** 'fit'は画像をプレビューに収まるよう縮める。'actual'はスクロールする枠の中に等倍で描く。 */
type ImageScale = 'fit' | 'actual';

interface ImageSize {
  width: number;
  height: number;
}

/**
 * プレビューに合わせた画像と、そのピクセル数、実寸への切り替え（ボタンか画像のクリック）。
 * 横に長いスペクトログラムやパノラマは、縮めると読めないため。
 */
export function ImagePreview({ artifact }: { artifact: Artifact }) {
  useLocale();
  const [failed, setFailed] = useState(false);
  const [scale, setScale] = useState<ImageScale>('fit');
  const [naturalSize, setNaturalSize] = useState<ImageSize | null>(null);
  if (failed) return <ErrorNotice message={text.contentError} retry={() => setFailed(false)} />;
  const toggleScale = () => setScale(scale === 'fit' ? 'actual' : 'fit');
  return (
    <div className="image-preview">
      <div className="image-preview-toolbar">
        {naturalSize && (
          <span className="mono muted">{textTemplates.imageSize(naturalSize.width, naturalSize.height)}</span>
        )}
        <button type="button" className="button small" onClick={toggleScale} disabled={!naturalSize}>
          {scale === 'fit' ? <Maximize2 size={14} aria-hidden="true" /> : <Minimize2 size={14} aria-hidden="true" />}
          {scale === 'fit' ? text.imageShowActualSize : text.imageFitToFrame}
        </button>
      </div>
      {/* 実寸のときはフォーカスできるようにし、キーボードで枠をスクロールできるようにする。 */}
      <div
        className={`image-preview-frame image-preview-${scale}`}
        tabIndex={scale === 'actual' ? 0 : undefined}
        role={scale === 'actual' ? 'region' : undefined}
        aria-label={scale === 'actual' ? artifact.path : undefined}
      >
        {/* クリックはポインタ用の近道。キーボードでは上のボタンが同じことをする。 */}
        <img
          className="artifact-image"
          src={trackingApi.artifactUrl(artifact.projectId, artifact.id)}
          alt={artifact.path}
          onLoad={(event) =>
            setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
          }
          onClick={toggleScale}
          onError={() => setFailed(true)}
        />
      </div>
    </div>
  );
}
