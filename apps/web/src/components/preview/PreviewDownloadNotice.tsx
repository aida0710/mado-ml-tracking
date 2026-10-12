import type { Artifact } from '@mmt/contracts';
import { Download } from 'lucide-react';
import { trackingApi } from '../../api/tracking';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/**
 * Why the preview shows only part of the file, or none of it, with the download beside the reason:
 * the Artifacts list has no download column, so the preview must offer it.
 */
export function PreviewDownloadNotice({ artifact, message }: { artifact: Artifact; message: string }) {
  useLocale();
  return (
    <div className="notice preview-download-notice">
      <span>{message}</span>
      <a
        className="button small"
        href={trackingApi.artifactUrl(artifact.projectId, artifact.id)}
        download={artifact.path.split('/').pop()}
      >
        <Download size={14} aria-hidden="true" />
        {text.download}
      </a>
    </div>
  );
}
