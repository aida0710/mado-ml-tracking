import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Artifact } from '@mmt/contracts';
import { ArtifactBackToListButton } from './ArtifactBackToListButton';
import { ArtifactDetailsPanel } from './ArtifactDetailsPanel';
import { ArtifactTree } from './ArtifactTree';
import { ErrorNotice, Resource } from './Feedback';
import { useArtifactBrowserPanes } from '../hooks/useArtifactBrowserPanes';
import { useRunArtifacts } from '../hooks/useRunArtifacts';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { artifactsTextTemplates } from '../i18n/artifacts';

// URLに残し、再読み込みや戻る操作で同じフォルダに戻れるようにする。アップロードの
// ダイアログもそのフォルダから始まる。
export const RUN_ARTIFACT_PREFIX_PARAMETER = 'artifactPrefix';

/**
 * RunのArtifactを、左にフォルダのツリー、右に選んだファイルのプレビューで示す。狭い画面では、
 * ファイルを選ぶまではツリーを、選んだらそのファイルのプレビューを出す。
 */
export function RunArtifacts({
  projectId,
  runId,
  revision,
}: {
  projectId: string;
  runId: string;
  /** アップロードの後に増やすと読み直す。 */
  revision: number;
}) {
  useLocale();
  const [params, setParams] = useSearchParams();
  const prefix = params.get(RUN_ARTIFACT_PREFIX_PARAMETER) ?? '';
  // ここでの削除を数え、削除のたびにフォルダと開いているファイルを読み直す。
  const [deletions, setDeletions] = useState(0);
  const { tree, files } = useRunArtifacts({ projectId, runId, prefix }, revision + deletions);
  const [chosen, setChosen] = useState<Artifact>();
  // 削除したばかりのファイル。別のファイルを選ぶまで名前を出しておく。
  const [deleted, setDeleted] = useState<Artifact | null>(null);
  const { isNarrow, panes, containerRef, scrollBrowserIntoView } = useArtifactBrowserPanes(chosen !== undefined);
  // 以前の平らな一覧と同じく、ファイルを選ぶまでは開いているフォルダの先頭の
  // ファイルをプレビューする。削除の後は、別のファイルへ飛ばずにプレビューを空にしておく。
  const selected = chosen ?? (isNarrow || deleted ? undefined : files.items[0]);
  // ルートに何も無く、フォルダも無い。選ぶものが無いので、ファイルがここに入る方法を伝える。
  const isRunEmpty =
    prefix === '' && tree.value?.directories.length === 0 && !files.loading && files.items.length === 0;
  function showFile(artifact: Artifact | undefined) {
    setChosen(artifact);
    if (artifact) setDeleted(null);
    scrollBrowserIntoView();
  }
  function openDirectory(next: string) {
    setParams((previous) => {
      const updated = new URLSearchParams(previous);
      if (next) updated.set(RUN_ARTIFACT_PREFIX_PARAMETER, next);
      else updated.delete(RUN_ARTIFACT_PREFIX_PARAMETER);
      return updated;
    });
  }
  return (
    <>
      {deleted && (
        // 両方のペインの上に置き、すぐ一覧に戻る狭い画面でも目に入るようにする。
        <p className="notice artifact-deleted-notice" role="status" data-testid="artifact-deleted-notice">
          {artifactsTextTemplates.artifactDeleted(deleted.path)}
        </p>
      )}
      <div ref={containerRef} className="artifact-layout artifact-browser">
        {panes.showList && (
          <div>
            <Resource query={tree}>
              {(level) => (
                <ArtifactTree
                  tree={level}
                  files={files.items}
                  selectedArtifactId={selected?.id}
                  onOpenDirectory={openDirectory}
                  onSelectFile={showFile}
                  hasMoreFiles={files.hasMore}
                  loadingFiles={files.loading}
                  onLoadMoreFiles={files.loadMore}
                />
              )}
            </Resource>
            <ErrorNotice message={files.error} retry={files.reload} />
          </div>
        )}
        {panes.showBackToList && <ArtifactBackToListButton onClick={() => showFile(undefined)} />}
        {panes.showPreview &&
          (selected ? (
            <ArtifactDetailsPanel
              key={`${selected.id}:${deletions}`}
              latest={selected}
              onDeleted={(artifact) => {
                setChosen(undefined);
                setDeleted(artifact);
                setDeletions((count) => count + 1);
              }}
            />
          ) : (
            <section className="artifact-preview">
              <p className="muted">{isRunEmpty ? text.artifactRunEmpty : text.artifactSelectFile}</p>
            </section>
          ))}
      </div>
    </>
  );
}
