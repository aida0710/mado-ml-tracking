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

// Kept in the URL so reloading or going back returns to the same folder; the upload dialog starts there.
export const RUN_ARTIFACT_PREFIX_PARAMETER = 'artifactPrefix';

/**
 * A Run's Artifacts as a folder tree on the left and the chosen file's preview on the right; on a
 * narrow screen, the tree until a file is chosen and then that file's preview.
 */
export function RunArtifacts({
  projectId,
  runId,
  revision,
}: {
  projectId: string;
  runId: string;
  /** Increment to reload after an upload. */
  revision: number;
}) {
  useLocale();
  const [params, setParams] = useSearchParams();
  const prefix = params.get(RUN_ARTIFACT_PREFIX_PARAMETER) ?? '';
  // Counts deletions made here, so the folder and the open file reload after each one.
  const [deletions, setDeletions] = useState(0);
  const { tree, files } = useRunArtifacts({ projectId, runId, prefix }, revision + deletions);
  const [chosen, setChosen] = useState<Artifact>();
  // The file just deleted, named until another file is chosen.
  const [deleted, setDeleted] = useState<Artifact | null>(null);
  const { isNarrow, panes, containerRef, scrollBrowserIntoView } = useArtifactBrowserPanes(chosen !== undefined);
  // Like the earlier flat list, the first file of the open folder previews until one is chosen;
  // after a deletion the preview stays empty rather than jumping to another file.
  const selected = chosen ?? (isNarrow || deleted ? undefined : files.items[0]);
  // Nothing at the root and no folders: there is nothing to choose, so say how files get here.
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
        // Above both panes, so it is seen on a narrow screen too, where the list returns at once.
        <p className="notice artifact-deleted-notice" role="status" data-testid="artifact-deleted-notice">
          {artifactsTextTemplates.artifactDeleted(deleted.path)}
        </p>
      )}
      <div ref={containerRef} className="artifact-layout artifact-browser touch-targets">
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
