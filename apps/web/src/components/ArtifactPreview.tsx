import type { Artifact } from '@mmt/contracts';
import { artifactMediaKind } from '../lib/artifactMediaKind';
import { tabularTextFormat } from '../lib/tabularText';
import { AudioArtifactViewer } from './preview/AudioArtifactViewer';
import { ImagePreview } from './preview/ImagePreview';
import { MediaTablePreview } from './preview/MediaTablePreview';
import { PreviewDownloadNotice } from './preview/PreviewDownloadNotice';
import { TabularTextPreview } from './preview/TabularTextPreview';
import { TextPreview } from './preview/TextPreview';
import { VideoPreview } from './preview/VideoPreview';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/** Chooses the preview for an Artifact's media kind; each kind lives in components/preview/. */
export function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  useLocale();
  const mediaKind = artifactMediaKind(artifact.mimeType);
  const tableFormat = tabularTextFormat(artifact.path, artifact.mimeType);
  if (mediaKind === 'text' && tableFormat) return <TabularTextPreview artifact={artifact} format={tableFormat} />;
  if (isJsonArtifact(artifact) && artifact.runId) return <MediaTablePreview artifact={artifact} runId={artifact.runId} />;
  if (mediaKind === 'text') return <TextPreview artifact={artifact} />;
  if (mediaKind === 'image') return <ImagePreview artifact={artifact} />;
  if (mediaKind === 'audio') return <AudioArtifactViewer artifact={artifact} />;
  if (mediaKind === 'video') return <VideoPreview artifact={artifact} />;
  return <PreviewDownloadNotice artifact={artifact} message={text.previewUnsupported} />;
}

// Media tables are stored as orient='split' JSON; only a Run's JSON can be one.
function isJsonArtifact(artifact: Artifact): boolean {
  return artifact.mimeType.split(';')[0]!.trim().toLowerCase() === 'application/json';
}
