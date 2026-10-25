import type { Artifact } from '@mmt/contracts';
import { Download } from 'lucide-react';
import { trackingApi } from '../../api/tracking';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/**
 * プレビューがファイルの一部しか、または何も出さない理由と、その横のダウンロード。
 * Artifactsの一覧にはダウンロードの列が無いので、プレビューで出さなければならない。
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
