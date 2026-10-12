import { Link } from 'react-router-dom';
import { datasetFolderUploadPrefix } from '@mmt/contracts';
import type { FolderUploadDiscardWithKeptFiles } from '../hooks/useDatasetFolderUploads';
import { formatDate } from '../lib/format';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';

/**
 * After a discard of a stopped folder upload that kept files something uses: why they stayed (and
 * why the attempt is still listed), with a link to the Artifacts list of the folder, whose 所属
 * column names what uses each file.
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
