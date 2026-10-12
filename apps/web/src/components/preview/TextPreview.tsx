import type { Artifact } from '@mmt/contracts';
import { fetchArtifactTextHead } from '../../api/artifactTextHead';
import { trackingApi } from '../../api/tracking';
import { useQuery } from '../../hooks/useQuery';
import { formatBytes } from '../../lib/format';
import { Resource } from '../Feedback';
import { CodeView } from './CodeView';
import { PreviewDownloadNotice } from './PreviewDownloadNotice';
import { useLocale } from '../../i18n/useLocale';
import { textTemplates } from '../../i18n/catalog';
import { joinSentences } from '../../i18n/textJoining';

/**
 * Text previews are colored on the main thread; 1MiB stays well under a second. Larger files show
 * their first 1MiB, which is where a training log says how the run started.
 */
export const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;

function isTextHeadOnly(artifact: Artifact): boolean {
  return artifact.size > TEXT_PREVIEW_MAX_BYTES;
}

/**
 * Says the text below is only the head of the file (and `reason`, why it is text at all), with the
 * download beside it. Nothing when the whole file is shown and there is no reason to give.
 */
export function TextHeadNotice({ artifact, reason }: { artifact: Artifact; reason?: string }) {
  useLocale();
  const headMessage = isTextHeadOnly(artifact)
    ? textTemplates.previewTextHead(formatBytes(TEXT_PREVIEW_MAX_BYTES), formatBytes(artifact.size))
    : '';
  if (!reason && !headMessage) return null;
  return <PreviewDownloadNotice artifact={artifact} message={joinSentences([reason ?? '', headMessage])} />;
}

/** The text colored by its format; over TEXT_PREVIEW_MAX_BYTES only the head is read (a Range request). */
export function TextPreview({ artifact, reason }: { artifact: Artifact; reason?: string }) {
  useLocale();
  const headOnly = isTextHeadOnly(artifact);
  const content = useQuery(`${artifact.id}:${headOnly ? 'text-head' : 'text'}`, (signal) =>
    headOnly
      ? fetchArtifactTextHead(
          { projectId: artifact.projectId, artifactId: artifact.id, maxBytes: TEXT_PREVIEW_MAX_BYTES },
          signal,
        )
      : trackingApi.artifactText(artifact.projectId, artifact.id, signal),
  );
  return (
    <>
      <TextHeadNotice artifact={artifact} reason={reason} />
      <Resource query={content}>
        {(value) => <CodeView content={value} fileName={artifact.path} mimeType={artifact.mimeType} />}
      </Resource>
    </>
  );
}
