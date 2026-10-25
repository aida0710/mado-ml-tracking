import type { CodeSource } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { CodeFilesViewer } from './CodeFilesViewer';
import { CopyableValue } from './CopyableValue';
import { DetailsList } from './JsonDetails';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { codeSourceText } from '../i18n/codeSource';

/**
 * コードバージョンのファイルの出どころを、バージョンのフォームを開かずに読めるようにする。inlineの
 * バージョンならそのファイル、gitならリポジトリとその上で編集したファイル、またはArtifact。
 */
export function CodeSourceDetails({
  projectId,
  source,
}: {
  projectId: string;
  source: CodeSource;
}) {
  useLocale();
  if (source.kind === 'inline')
    return (
      <>
        <DetailsList entries={[[text.sourceKind, text.inlineSource]]} />
        <CodeFilesViewer files={source.files} />
      </>
    );
  if (source.kind === 'artifact')
    return (
      <DetailsList
        entries={[
          [text.sourceKind, text.artifactSource],
          [
            text.artifactId,
            <a className="mono break-word" href={trackingApi.artifactUrl(projectId, source.artifactId)}>
              {source.artifactId}
            </a>,
          ],
        ]}
      />
    );
  const editedFiles = source.files ?? {};
  const deletedFiles = source.deletedFiles ?? [];
  return (
    <>
      <DetailsList
        entries={[
          [text.sourceKind, text.gitSource],
          [text.gitUrl, <CopyableValue value={source.url} />],
          [text.commit, <CopyableValue value={source.commit} />],
        ]}
      />
      <h4>{codeSourceText.editedFiles}</h4>
      {Object.keys(editedFiles).length ? (
        <CodeFilesViewer files={editedFiles} />
      ) : (
        <p className="muted">{codeSourceText.noEditedFiles}</p>
      )}
      {deletedFiles.length > 0 && (
        <>
          <h4>{codeSourceText.deletedFiles}</h4>
          <ul className="mono code-deleted-files">
            {deletedFiles.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
