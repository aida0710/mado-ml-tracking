import { useLocale } from '../../i18n/useLocale';
import { useState } from 'react';
import type { Artifact } from '@mmt/contracts';
import { Maximize2, Minimize2 } from 'lucide-react';
import { trackingApi } from '../../api/tracking';
import { ErrorNotice } from '../Feedback';
import { text, textTemplates } from '../../i18n/catalog';

/** 'fit' shrinks the image into the preview; 'actual' draws it pixel for pixel in a scrolling frame. */
type ImageScale = 'fit' | 'actual';

interface ImageSize {
  width: number;
  height: number;
}

/**
 * An image fitted to the preview, with its size in pixels and a toggle (the button, or a click on
 * the image) to the actual size: a wide spectrogram or a panorama is unreadable when shrunk.
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
      {/* Focusable at the actual size so a keyboard can scroll the frame. */}
      <div
        className={`image-preview-frame image-preview-${scale}`}
        tabIndex={scale === 'actual' ? 0 : undefined}
        role={scale === 'actual' ? 'region' : undefined}
        aria-label={scale === 'actual' ? artifact.path : undefined}
      >
        {/* The click is a pointer shortcut; the button above does the same for keyboards. */}
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
