import { useState, type ReactNode } from 'react';
import type { Dataset, DatasetVersion } from '@mmt/contracts';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { registryApi } from '../api/registry';
import { trackingApi } from '../api/tracking';
import { useProject } from '../hooks/useProject';
import { useRegistry } from '../hooks/useRegistry';
import { useQuery } from '../hooks/useQuery';
import { useDatasetVersionsById } from '../hooks/useDatasetVersionsById';
import { PageHeader } from '../components/PageHeader';
import { ResponsiveTable } from '../components/ResponsiveTable';
import { RegistryLayout } from '../components/RegistryLayout';
import { Empty, ErrorNotice, Resource } from '../components/Feedback';
import { DetailsList, JsonDetails } from '../components/JsonDetails';
import { FormDialog } from '../components/FormDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DatasetVersionDialog, type DatasetVersionSource } from '../dialogs/DatasetVersionDialog';
import { DatasetFiles } from '../components/DatasetFiles';
import { DatasetActionsMenu } from '../components/DatasetActionsMenu';
import { DatasetVersionParentsPanel } from '../components/DatasetVersionParentsPanel';
import { DatasetVersionUsage } from '../components/DatasetVersionUsage';
import { DatasetPluginActions } from '../components/DatasetPluginActions';
import { datasetVersionLabel } from '../lib/datasetVersionLabel';
import { formatBytes, shortRunId } from '../lib/format';
import { getFieldValue } from '../lib/formValues';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';

export function DatasetsPage() {
  useLocale();
  const { project, canEdit } = useProject();
  const [dialog, setDialog] = useState<'dataset' | DatasetVersionSource | null>(null);
  const [versionToDelete, setVersionToDelete] = useState<DatasetVersion | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  // 直前のアーカイブ・アーカイブ解除の結果。そのデータセットを開いている間だけ見せる。
  const [archiveChange, setArchiveChange] = useState<Dataset | null>(null);
  const registry = useRegistry(`${project.id}:datasets`, {
    // アーカイブしたデータセットを最後に並べ、既定で開くものが使用中のものになるようにする。
    list: async (signal) =>
      (await registryApi.datasets(project.id, signal)).sort(
        (left, right) => Number(left.archivedAt !== null) - Number(right.archivedAt !== null),
      ),
    versions: (id, signal) => registryApi.datasetVersions(project.id, id, signal),
    parentId: (version) => version.datasetId,
  });
  return (
    <section className="page datasets-page">
      <PageHeader
        title={text.datasets}
        eyebrow={project.name}
        actions={
          <>
            <DatasetPluginActions projectId={project.id} />
            {canEdit && (
              <button className="button primary" onClick={() => setDialog('dataset')}>
                <Plus size={15} />
                {text.newDataset}
              </button>
            )}
            <button className="icon-button" aria-label={text.refresh} onClick={registry.reload}>
              <RefreshCw size={17} />
            </button>
          </>
        }
      />
      <Resource query={registry.list}>
        {(items) => (
          <RegistryLayout
            selectedKey={registry.selected?.id}
            list={
              <>
                <label className="checkbox-field dataset-archived-filter">
                  <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={(event) => setIncludeArchived(event.target.checked)}
                  />
                  {text.datasetIncludeArchived}
                </label>
                <ResponsiveTable
                  // リンクから開いたアーカイブ済みのデータセットは、表示している間は一覧に残す。
                  rows={items.filter(
                    (item) => includeArchived || !item.archivedAt || item.id === registry.selected?.id,
                  )}
                  rowKey={(item) => item.id}
                  selectedKey={registry.selected?.id}
                  columns={[
                    {
                      key: 'name',
                      header: text.name,
                      priority: 'primary',
                      render: (item) => (
                        <span className="dataset-name-cell">
                          <button className="link-button" onClick={() => registry.selectItem(item.id)}>
                            {item.name}
                          </button>
                          {item.archivedAt && <span className="status-badge status-accent">{text.datasetArchived}</span>}
                        </span>
                      ),
                    },
                    { key: 'namespace', header: text.namespace, priority: 'secondary', render: (item) => item.namespace },
                    {
                      key: 'version',
                      header: text.latestVersion,
                      priority: 'primary',
                      render: (item) => item.latestVersion ?? '—',
                      className: 'mono break-word',
                    },
                  ]}
                />
              </>
            }
          >
            <ErrorNotice
              message={registry.lookup.error ?? registry.selectionError}
              retry={registry.lookup.reload}
            />
            {registry.selected ? (
              <>
                <div className="section-heading">
                  <h2>
                    {registry.selected.name}
                    {registry.selected.archivedAt && (
                      <span className="status-badge status-accent">{text.datasetArchived}</span>
                    )}
                  </h2>
                  {canEdit && (
                    <div className="section-heading-actions">
                      <button className="button small" onClick={() => setDialog('folder')}>
                        {text.datasetVersionFromFolder}
                      </button>
                      <button className="button small" onClick={() => setDialog('reference')}>
                        {text.newVersion}
                      </button>
                      <DatasetActionsMenu
                        dataset={registry.selected}
                        onChanged={(updated) => {
                          // アーカイブするとデータセットが一覧の最後に移り、URLで何も選んでいないときに
                          // 別のデータセットを開いてしまう。
                          registry.pinSelectedItem();
                          if ((updated.archivedAt === null) !== (registry.selected?.archivedAt === null))
                            setArchiveChange(updated);
                          registry.reload();
                        }}
                      />
                    </div>
                  )}
                </div>
                {archiveChange?.id === registry.selected.id && (
                  <p className="notice" role="status" data-testid="dataset-archive-change">
                    {archiveChange.archivedAt
                      ? textTemplates.datasetArchivedDone(archiveChange.name)
                      : textTemplates.datasetUnarchivedDone(archiveChange.name)}
                  </p>
                )}
                <DatasetSummary dataset={registry.selected} />
                <Resource query={registry.versions}>
                  {(versions) => (
                    <>
                      {versions.length === 0 && (
                        <p className="muted" data-testid="dataset-no-versions">
                          {canEdit ? text.datasetNoVersionsEditor : text.datasetNoVersions}
                        </p>
                      )}
                      {versions.length > 0 && (
                        <ResponsiveTable
                          rows={versions}
                          rowKey={(version) => version.id}
                          selectedKey={registry.selectedVersion?.id}
                          columns={[
                            {
                              key: 'version',
                              header: text.version,
                              priority: 'primary',
                              render: (version) => (
                                <button
                                  className="link-button mono"
                                  onClick={() => registry.selectVersion(version.id)}
                                >
                                  {version.version}
                                </button>
                              ),
                            },
                            {
                              key: 'content',
                              header: text.datasetContentKind,
                              priority: 'primary',
                              render: (version) =>
                                version.contentKind === 'artifacts'
                                  ? textTemplates.datasetContentArtifacts(
                                      version.fileCount ?? 0,
                                      formatBytes(version.totalSize ?? 0),
                                    )
                                  : text.datasetContentReference,
                            },
                            {
                              key: 'uri',
                              header: text.uri,
                              priority: 'secondary',
                              render: (version) => (
                                <span className="mono break-word">{version.uri}</span>
                              ),
                            },
                            {
                              key: 'digest',
                              header: text.digest,
                              priority: 'secondary',
                              render: (version) => (
                                <span className="mono break-word">{version.digest}</span>
                              ),
                            },
                          ]}
                        />
                      )}
                      {registry.selectedVersion && (
                        <div className="version-detail">
                          <div className="version-detail-actions">
                            <DatasetPluginActions projectId={project.id} version={registry.selectedVersion} />
                            {canEdit && (
                              <button
                                className="button small danger"
                                onClick={() => setVersionToDelete(registry.selectedVersion ?? null)}
                              >
                                {text.datasetVersionDelete}
                              </button>
                            )}
                          </div>
                          <DetailsList
                            entries={[
                              [
                                text.parents,
                                registry.selectedVersion.parentDatasetVersionIds.length > 0 ? (
                                  <ParentVersionLinks
                                    version={registry.selectedVersion}
                                    loadedVersions={versions}
                                    datasets={items}
                                  />
                                ) : null,
                              ],
                              ...(registry.selectedVersion.contentKind === 'artifacts'
                                ? artifactContentEntries(registry.selectedVersion)
                                : []),
                              [
                                text.sourceRun,
                                registry.selectedVersion.sourceRunId ? (
                                  <SourceRunLink
                                    projectId={project.id}
                                    runId={registry.selectedVersion.sourceRunId}
                                  />
                                ) : null,
                              ],
                            ]}
                          />
                          <DatasetVersionParentsPanel
                            key={registry.selectedVersion.id}
                            version={registry.selectedVersion}
                            canEdit={canEdit}
                            onSaved={registry.reload}
                          />
                          <DatasetVersionUsage version={registry.selectedVersion} />
                          <h3>{text.datasetFiles}</h3>
                          {registry.selectedVersion.contentKind === 'artifacts' ? (
                            <DatasetFiles
                              key={registry.selectedVersion.id}
                              version={registry.selectedVersion}
                            />
                          ) : (
                            <p className="muted">{text.datasetFilesReferenceOnly}</p>
                          )}
                          <h3>{text.schema}</h3>
                          <JsonDetails value={registry.selectedVersion.schema} />
                          <h3>{text.metadata}</h3>
                          <JsonDetails value={registry.selectedVersion.metadata} />
                          {registry.selectedVersion.externalRef && (
                            <>
                              <h3>{text.externalReference}</h3>
                              <JsonDetails value={registry.selectedVersion.externalRef} />
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </Resource>
              </>
            ) : (
              <Empty>{text.selectItem}</Empty>
            )}
          </RegistryLayout>
        )}
      </Resource>
      {dialog === 'dataset' && (
        <FormDialog
          title={text.newDataset}
          onClose={() => setDialog(null)}
          fields={[
            { name: 'name', label: text.name, required: true },
            { name: 'namespace', label: text.namespace },
            { name: 'description', label: text.description, type: 'textarea' },
          ]}
          onSubmit={(values) =>
            registryApi.createDataset(project.id, {
              name: getFieldValue(values, 'name'),
              namespace: getFieldValue(values, 'namespace'),
              description: getFieldValue(values, 'description'),
            })
          }
          onSaved={(dataset) => {
            setDialog(null);
            registry.reload();
            registry.selectItem(dataset.id);
          }}
        />
      )}
      {versionToDelete && (
        <ConfirmDialog
          title={text.datasetVersionDeleteTitle}
          message={textTemplates.datasetVersionDeleteMessage(versionToDelete.version)}
          confirmLabel={text.datasetVersionDeleteConfirm}
          destructive
          onConfirm={() =>
            registryApi.deleteDatasetVersion(project.id, {
              datasetId: versionToDelete.datasetId,
              versionId: versionToDelete.id,
            })
          }
          onConfirmed={() => {
            setVersionToDelete(null);
            registry.reload();
            registry.selectItem(versionToDelete.datasetId);
          }}
          onClose={() => setVersionToDelete(null)}
        />
      )}
      {(dialog === 'reference' || dialog === 'folder') && registry.selected && (
        <DatasetVersionDialog
          dataset={registry.selected}
          source={dialog}
          onClose={() => setDialog(null)}
          onSaved={(version) => {
            setDialog(null);
            registry.reload();
            registry.selectVersion(version.id);
          }}
        />
      )}
    </section>
  );
}

/** データセットの名前の下に出す。一覧には出ないNamespaceと説明。 */
function DatasetSummary({ dataset }: { dataset: Dataset }) {
  useLocale();
  return (
    <div className="dataset-summary" data-testid="dataset-summary">
      {dataset.namespace && (
        <p className="mono muted">
          {text.namespace}: {dataset.namespace}
        </p>
      )}
      <p className={dataset.description ? 'dataset-description' : 'muted'}>
        {dataset.description || text.datasetNoDescription}
      </p>
      {dataset.archivedAt && <p className="notice">{text.datasetArchivedNotice}</p>}
    </div>
  );
}

/** 親をバージョン名で示す（別のデータセットなら、そのデータセットの名前も付ける）。 */
function ParentVersionLinks({
  version,
  loadedVersions,
  datasets,
}: {
  version: DatasetVersion;
  loadedVersions: DatasetVersion[];
  datasets: Dataset[];
}) {
  useLocale();
  const { project } = useProject();
  const parents = useDatasetVersionsById({
    projectId: project.id,
    ids: version.parentDatasetVersionIds,
    loadedVersions,
    datasets,
  });
  return (
    <>
      {version.parentDatasetVersionIds.map((id) => {
        const parent = parents.get(id);
        return (
          <Link
            key={id}
            className={parent ? 'version-link' : 'version-link mono'}
            to={`/projects/${project.id}/datasets?version=${id}`}
          >
            {parent ? datasetVersionLabel(parent, version.datasetId) : id}
          </Link>
        );
      })}
    </>
  );
}

function SourceRunLink({ projectId, runId }: { projectId: string; runId: string }) {
  useLocale();
  const run = useQuery({ key: `${projectId}:run:${runId}`, load: (signal) => trackingApi.run(projectId, runId, signal) });
  return (
    <Link to={`/projects/${projectId}/runs/${runId}`}>
      {run.value?.name ?? shortRunId(runId)}
    </Link>
  );
}

function artifactContentEntries(version: DatasetVersion): Array<[string, ReactNode]> {
  return [
    [text.datasetFileCount, version.fileCount],
    [text.datasetTotalSize, formatBytes(version.totalSize ?? 0)],
  ];
}
