import type { ArtifactMediaInfo, RunMedia } from '@mmt/contracts';
import { useExclusiveAudio } from '../../hooks/useExclusiveAudio';
import { formatAudioTime } from '../../lib/audioTimeline';
import { runMediaArtifact } from '../../lib/mediaPreviewArtifact';
import { AudioArtifactViewer } from '../preview/AudioArtifactViewer';
import { ImagePreview } from '../preview/ImagePreview';
import { VideoPreview } from '../preview/VideoPreview';
import { MediaTableView } from './MediaTableView';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';
import { artifactsTextTemplates } from '../../i18n/artifacts';

function MediaInfoLine({ info }: { info: ArtifactMediaInfo }) {
  useLocale();
  return (
    <p className="muted mono media-info">
      {[
        artifactsTextTemplates.audioSampleRateValue(info.sampleRate),
        `${info.channels}ch`,
        formatAudioTime(info.durationSeconds),
        info.codec,
      ].join(' · ')}
    </p>
  );
}

function Caption({ media }: { media: RunMedia }) {
  useLocale();
  if (!media.caption) return null;
  return (
    <p className="media-caption">
      <span className="muted">{text.mediaCaption}: </span>
      {media.caption}
    </p>
  );
}

/**
 * 1つのキーの1つのstepのメディア。画像はグリッド、音声はビューアに縦に積み、動画と表はその
 * 下に出す。鳴る音声は一度に1つだけで、ギャラリーがアンマウントされるとすべて止まる。
 * stepのスライダーを動かすと前のstepの音声が止まるのはこのため。
 */
export function MediaGallery({ projectId, items }: { projectId: string; items: readonly RunMedia[] }) {
  useLocale();
  const audio = useExclusiveAudio();
  const images = items.filter((item) => item.kind === 'image');
  const others = items.filter((item) => item.kind !== 'image');
  return (
    <div className="media-gallery">
      {images.length > 0 && (
        <div className="media-image-grid">
          {images.map((media) => (
            <figure key={media.id} className="media-image">
              <ImagePreview artifact={runMediaArtifact(projectId, media)} />
              {media.caption && <figcaption>{media.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      {others.map((media) => (
        <section key={media.id} className="media-item" aria-label={`${media.key} step ${media.step}`}>
          <Caption media={media} />
          {media.kind === 'audio' && (
            <>
              {media.mediaInfo && <MediaInfoLine info={media.mediaInfo} />}
              <AudioArtifactViewer
                artifact={runMediaArtifact(projectId, media)}
                onPlay={() => audio.played(media.id)}
                onAudioElement={audio.register(media.id)}
              />
            </>
          )}
          {media.kind === 'video' && <VideoPreview artifact={runMediaArtifact(projectId, media)} />}
          {media.kind === 'table' && <MediaTableView projectId={projectId} runId={media.runId} mediaId={media.id} />}
        </section>
      ))}
    </div>
  );
}
