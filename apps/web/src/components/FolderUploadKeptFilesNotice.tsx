import { Link } from 'react-router-dom';
import { datasetFolderUploadPrefix } from '@mmt/contracts';
import type { FolderUploadDiscardWithKeptFiles } from '../hooks/useDatasetFolderUploads';
import { formatDate } from '../lib/format';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';

/**
 * 止まったフォルダのアップロードを破棄したとき、何かが使っているファイルが残った場合の案内。
 * 残った理由（と、そのアップロードがまだ一覧にある理由）を伝え、フォルダのArtifactの一覧への
 * リンクを添える。その一覧の「所属」の列に、各ファイルを使っているものが出る。
 */
export function FolderUploadKeptFilesNotice({
  projectId,
  datasetId,
  discard,
}: {
  projectId: string;
  datasetId: string;
  discard: FolderUploadDiscardWithKeptFiles;
}) {
  useLocale();
  const prefix = datasetFolderUploadPrefix({ datasetId, folder: discard.upload.folder });
  return (
    <div className="notice action-notice folder-upload-kept-files" role="status" data-testid="folder-upload-kept-files">
      <span>
        {textTemplates.datasetFolderDiscardKeptFiles(formatDate(discard.upload.startedAt), discard.keptFileCount)}
      </span>
      <Link
        className="button small"
        to={`/projects/${encodeURIComponent(projectId)}/artifacts?query=${encodeURIComponent(prefix)}`}
      >
        {text.datasetFolderShowKeptFiles}
      </Link>
    </div>
  );
}
