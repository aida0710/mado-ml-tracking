import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import type { Artifact } from '@mmt/contracts';
import { registryApi } from '../api/registry';
import { trackingApi } from '../api/tracking';
import { useProject } from '../hooks/useProject';
import { useQuery } from '../hooks/useQuery';
import {
  useProjectArtifactCatalog,
  type ProjectArtifactFilter,
} from '../hooks/useProjectArtifacts';
import { PageHeader } from '../components/PageHeader';
import { StandaloneArtifactUpload } from '../components/StandaloneArtifactUpload';
import { ResponsiveTable } from '../components/ResponsiveTable';
import { ArtifactBackToListButton } from '../components/ArtifactBackToListButton';
import { useArtifactBrowserPanes } from '../hooks/useArtifactBrowserPanes';
import { ErrorNotice } from '../components/Feedback';
import { ArtifactDetailsPanel } from '../components/ArtifactDetailsPanel';
import { ArtifactOwnerCell } from '../components/ArtifactOwnerCell';
import { useArtifactReferences } from '../hooks/useArtifactReferences';
import { ARTIFACT_SEARCH_MAX_LENGTH } from '../lib/artifactCatalog';
import { artifactKindLabel } from '../lib/artifactKindLabel';
import { formatBytes, formatDate, shortRunId } from '../lib/format';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { artifactsTextTemplates } from '../i18n/artifacts';

// Runの絞り込みに出す最近のRunの数。古いRunには、そのRunの画面のリンクから来る。
const RUN_FILTER_OPTION_LIMIT = 200;
const getMimeTypeOptions = () => [
  ['', text.artifactMimeAll],
  ['audio/*', text.artifactMimeAudio],
  ['image/*', text.artifactMimeImage],
  ['video/*', text.artifactMimeVideo],
  ['text/*', text.artifactMimeText],
  ['application/*', text.artifactMimeApplication],
] as const;

/**
 * Project全体のArtifactの検索。種類、Run、モデルバージョンで絞り込み、条件はURLに持つ。
 * 狭い画面では、結果と選んだファイルのプレビューを1つずつ見せる。
 */
export function ArtifactsPage() {
  useLocale();
  const { project, canEdit } = useProject();
  const [params, setParams] = useSearchParams();
  const filter: ProjectArtifactFilter = {
    query: params.get('query') ?? '',
    mimeType: params.get('mimeType') ?? '',
    runId: params.get('runId') ?? '',
    modelId: params.get('modelId') ?? '',
    modelVersionId: params.get('modelVersionId') ?? '',
    includePreviousVersions: params.get('versions') === 'all',
  };
  const { modelId } = filter;
  const [searchInput, setSearchInput] = useState(filter.query);
  const [selected, setSelected] = useState<Artifact>();
  // 消したばかりのファイル。別のファイルを選ぶまで名前を出す。
  const [deleted, setDeleted] = useState<Artifact | null>(null);
  const { panes, containerRef, scrollBrowserIntoView } = useArtifactBrowserPanes(selected !== undefined);
  const catalog = useProjectArtifactCatalog(project.id, filter);
  const runs = useQuery({ key: `${project.id}:artifact-filter-runs`, load: (signal) =>
    trackingApi.searchRuns(project.id, { limit: RUN_FILTER_OPTION_LIMIT }, signal),
  });
  const models = useQuery({ key: `${project.id}:artifact-filter-models`, load: (signal) =>
    registryApi.models(project.id, signal),
  });
  const modelVersions = useQuery({
    key: modelId ? `${project.id}:artifact-filter-versions:${modelId}` : null,
    load: (signal) => registryApi.modelVersions(project.id, modelId, signal),
  });
  const datasets = useQuery({ key: `${project.id}:artifact-owner-datasets`, load: (signal) =>
    registryApi.datasets(project.id, signal),
  });
  const runNames = new Map(runs.value?.items.map((run) => [run.id, run.name]));
  const datasetsById = new Map((datasets.value ?? []).map((dataset) => [dataset.id, dataset]));
  // Runの無いファイルは、それを参照しているもので示す。RunのファイルはRun自身で示す。
  const references = useArtifactReferences(
    project.id,
    catalog.items.filter((item) => item.runId === null).map((item) => item.id),
  );

  function reloadCatalog() {
    catalog.reload();
    references.reload();
  }

  function showArtifact(artifact: Artifact | undefined) {
    setSelected(artifact);
    if (artifact) setDeleted(null);
    scrollBrowserIntoView();
  }

  function updateParams(values: Record<string, string>) {
    setParams((previous) => {
      const updated = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(values))
        if (value) updated.set(key, value);
        else updated.delete(key);
      return updated;
    });
  }

  return (
    <section className="page artifact-catalog">
      <PageHeader
        title={text.artifacts}
        eyebrow={project.name}
        description={text.artifactCatalogDescription}
        actions={
          <>
            {canEdit && <StandaloneArtifactUpload projectId={project.id} onUploaded={reloadCatalog} />}
            <button className="icon-button" aria-label={text.refresh} onClick={reloadCatalog}>
              <RefreshCw size={17} />
            </button>
          </>
        }
      />
      <div className="toolbar artifact-catalog-toolbar">
        <form
          className="toolbar-search"
          onSubmit={(event) => {
            event.preventDefault();
            updateParams({ query: searchInput.trim() });
          }}
        >
          <Search size={16} />
          <input
            aria-label={text.artifactCatalogSearch}
            placeholder={text.artifactCatalogSearch}
            maxLength={ARTIFACT_SEARCH_MAX_LENGTH}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button className="button small" type="submit">
            {text.search}
          </button>
        </form>
        <label className="toolbar-item">
          <span>{text.artifactMimeType}</span>
          <select
            aria-label={text.artifactMimeType}
            value={filter.mimeType}
            onChange={(event) => updateParams({ mimeType: event.target.value })}
          >
            {getMimeTypeOptions().map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-item">
          <span>{text.artifactRun}</span>
          <select
            aria-label={text.artifactRun}
            value={filter.runId}
            onChange={(event) => updateParams({ runId: event.target.value })}
          >
            <option value="">{text.artifactAllRuns}</option>
            {filter.runId && !runNames.has(filter.runId) && (
              <option value={filter.runId}>{shortRunId(filter.runId)}</option>
            )}
            {runs.value?.items.map((run) => (
              <option key={run.id} value={run.id}>
                {run.name}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-item">
          <span>{text.artifactModelFilter}</span>
          <select
            aria-label={text.artifactModelFilter}
            value={modelId}
            onChange={(event) => updateParams({ modelId: event.target.value, modelVersionId: '' })}
          >
            <option value="">{text.artifactAllModels}</option>
            {models.value?.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
        {modelId && (
          <label className="toolbar-item">
            <span>{text.artifactModelVersionFilter}</span>
            <select
              aria-label={text.artifactModelVersionFilter}
              value={filter.modelVersionId}
              onChange={(event) => updateParams({ modelVersionId: event.target.value })}
            >
              <option value="">{text.artifactAllModelVersions}</option>
              {modelVersions.value?.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.version}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="toolbar-item">
          <input
            type="checkbox"
            checked={filter.includePreviousVersions}
            onChange={(event) => updateParams({ versions: event.target.checked ? 'all' : '' })}
          />
          <span>{text.artifactIncludePreviousVersions}</span>
        </label>
      </div>
      <ErrorNotice
        message={runs.error ?? models.error ?? references.error}
        retry={runs.error ? runs.reload : models.error ? models.reload : references.reload}
      />
      {deleted && (
        // 両方のペインの上に置き、すぐに一覧へ戻る狭い画面でも見えるようにする。
        <p className="notice artifact-deleted-notice" role="status" data-testid="artifact-deleted-notice">
          {artifactsTextTemplates.artifactDeleted(deleted.path)}
        </p>
      )}
      <div ref={containerRef} className="artifact-layout">
        {panes.showList && (
          <div>
            <ResponsiveTable
              rows={catalog.items}
              rowKey={(item) => item.id}
              selectedKey={selected?.id}
              empty={catalog.loading ? text.loading : text.artifactNoCatalogResults}
              columns={[
                {
                  key: 'path',
                  header: text.artifactPath,
                  priority: 'primary',
                  render: (item) => (
                    <button className="link-button mono break-word" onClick={() => showArtifact(item)}>
                      {item.path}
                    </button>
                  ),
                },
                {
                  key: 'owner',
                  header: text.artifactOwner,
                  priority: 'secondary',
                  render: (item) => (
                    <ArtifactOwnerCell
                      artifact={item}
                      runName={item.runId ? runNames.get(item.runId) : undefined}
                      references={references.byArtifactId.get(item.id)}
                      areReferencesChecked={references.isChecked(item.id)}
                      datasets={datasetsById}
                    />
                  ),
                },
                {
                  key: 'mimeType',
                  header: text.artifactMimeType,
                  priority: 'secondary',
                  className: 'nowrap',
                  render: (item) => <span title={item.mimeType}>{artifactKindLabel(item.mimeType)}</span>,
                },
                {
                  key: 'size',
                  header: text.size,
                  priority: 'primary',
                  className: 'mono nowrap',
                  render: (item) => formatBytes(item.size),
                },
                {
                  key: 'created',
                  header: text.created,
                  priority: 'secondary',
                  className: 'mono',
                  render: (item) => formatDate(item.createdAt),
                },
              ]}
            />
            <ErrorNotice message={catalog.error} retry={catalog.reload} />
            {catalog.hasMore && (
              <button
                className="button artifact-load-more"
                disabled={catalog.loading}
                onClick={catalog.loadMore}
              >
                {text.artifactLoadMore}
              </button>
            )}
          </div>
        )}
        {panes.showBackToList && <ArtifactBackToListButton onClick={() => showArtifact(undefined)} />}
        {panes.showPreview && (
          selected ? (
            <ArtifactDetailsPanel
              key={selected.id}
              latest={selected}
              onDeleted={(artifact) => {
                setSelected(undefined);
                setDeleted(artifact);
                catalog.reload();
              }}
            />
          ) : (
            <section className="artifact-preview">
              <p className="muted">{text.artifactSelectFile}</p>
            </section>
          )
        )}
      </div>
    </section>
  );
}
