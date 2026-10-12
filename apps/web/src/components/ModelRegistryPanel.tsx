import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import type { ProjectRole } from '@mmt/contracts';
import type { ModelRegistryState } from '../types/modelRegistry';
import { ResponsiveTable } from './ResponsiveTable';
import { RegistryLayout } from './RegistryLayout';
import { Empty, ErrorNotice, Resource } from './Feedback';
import { DetailsList, JsonDetails } from './JsonDetails';
import { CodeVersionNameLink } from './CodeVersionNameLink';
import { ModelAliasHistory } from './ModelAliasHistory';
import { FamilyCodeVersions } from './FamilyCodeVersions';
import { ModelVersionArtifactLink } from './ModelVersionArtifactLink';
import { ModelVersionNameLink } from './ModelVersionNameLink';
import { ModelVersionsTable } from './ModelVersionsTable';
import type { ModelAliasHistoryState } from '../hooks/useModelAliasHistory';
import { useModelAliasProtections } from '../hooks/useModelAliasProtections';
import { modelVersionPath } from '../lib/modelVersionPath';
import {
  canRemoveAlias,
  effectiveAliasProtection,
  roleToRemoveAlias,
} from '../lib/promotionEvidence';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { promotionTextTemplates } from '../i18n/promotion';
import { formatList } from '../i18n/textJoining';

export function ModelRegistryPanel({
  registry,
  projectId,
  projectRole,
  canEdit,
  aliasHistory,
  onCreateVersion,
  onAssignAlias,
  onRemoveAlias,
}: {
  registry: ModelRegistryState;
  projectId: string;
  projectRole: ProjectRole;
  canEdit: boolean;
  aliasHistory: ModelAliasHistoryState;
  onCreateVersion: () => void;
  onAssignAlias: () => void;
  onRemoveAlias: (assignment: { alias: string; version: string }) => void;
}) {
  useLocale();
  // Fetched again whenever the panel opens, so a protection added on its tab shows here.
  const protections = useModelAliasProtections(projectId, registry.selected?.id ?? null);
  const protectionOf = (alias: string) =>
    registry.selected
      ? effectiveAliasProtection(protections.value ?? [], { modelId: registry.selected.id, alias })
      : null;
  const versionLabel = (versionId: string) =>
    registry.versions.value?.find((version) => version.id === versionId)?.version ?? versionId;
  return (
    <Resource query={registry.list}>
      {(items) => (
        <RegistryLayout
          selectedKey={registry.selected?.id}
          list={
            <ResponsiveTable
              rows={items}
              rowKey={(item) => item.id}
              selectedKey={registry.selected?.id}
              columns={[
                {
                  key: 'name',
                  priority: 'primary',
                  header: text.name,
                  render: (item) => (
                    <button className="link-button" onClick={() => registry.selectItem(item.id)}>
                      {item.name}
                    </button>
                  ),
                },
                {
                  key: 'family',
                  priority: 'secondary',
                  header: text.family,
                  render: (item) => <span className="mono">{item.family}</span>,
                },
                {
                  key: 'version',
                  priority: 'primary',
                  header: text.latestVersion,
                  render: (item) => item.latestVersion ?? '—',
                  className: 'mono',
                },
                {
                  key: 'aliases',
                  priority: 'secondary',
                  header: text.alias,
                  render: (item) => formatList(Object.keys(item.aliases)) || '—',
                },
              ]}
            />
          }
        >
          <ErrorNotice
            message={registry.lookup.error ?? registry.selectionError}
            retry={registry.lookup.reload}
          />
          {registry.selected ? (
            <>
              <div className="section-heading">
                <h2>{registry.selected.name}</h2>
                {canEdit && (
                  <div>
                    <button className="button small" onClick={onAssignAlias}>
                      {text.assignAlias}
                    </button>
                    <button className="button small" onClick={onCreateVersion}>
                      {text.newVersion}
                    </button>
                  </div>
                )}
              </div>
              <p className="muted">{registry.selected.description}</p>
              <ResponsiveTable
                rows={Object.entries(registry.selected.aliases)}
                rowKey={([alias]) => alias}
                empty={text.aliasesEmpty}
                columns={[
                  {
                    key: 'alias',
                    priority: 'primary',
                    header: text.alias,
                    render: ([alias]) => {
                      const protection = protectionOf(alias);
                      return (
                        <>
                          <span className="mono">{alias}</span>
                          {protection && (
                            <span className="alias-protection">
                              <Lock size={12} aria-hidden="true" />
                              {promotionTextTemplates.protectedAliasLabel(protection.requiredRole)}
                            </span>
                          )}
                        </>
                      );
                    },
                  },
                  {
                    key: 'version',
                    priority: 'primary',
                    header: text.version,
                    className: 'mono',
                    render: ([, versionId]) => versionLabel(versionId),
                  },
                  ...(canEdit
                    ? [
                        {
                          key: 'actions',
                          priority: 'primary' as const,
                          // Named for screen readers; the buttons below say what they do.
                          header: <span className="sr-only">{text.actions}</span>,
                          render: ([alias, versionId]: [string, string]) => {
                            const protection = protectionOf(alias);
                            // Same check as the API's manual alias guard, so nobody is offered a
                            // removal that ends in 403.
                            if (protection && !canRemoveAlias(projectRole, protection))
                              return (
                                <span className="muted">
                                  {promotionTextTemplates.aliasRemovalRoleMissing(
                                    roleToRemoveAlias(protection),
                                  )}
                                </span>
                              );
                            return (
                              <button
                                className="button small"
                                onClick={() =>
                                  onRemoveAlias({ alias, version: versionLabel(versionId) })
                                }
                              >
                                {text.removeAlias}
                              </button>
                            );
                          },
                        },
                      ]
                    : []),
                ]}
              />
              <Resource query={registry.versions}>
                {(versions) => (
                  <>
                    <ModelVersionsTable
                      projectId={projectId}
                      versions={versions}
                      aliases={registry.selected!.aliases}
                      selectedVersionId={registry.selectedVersion?.id}
                    />
                    {registry.selectedVersion && (
                      <div className="version-detail">
                        <Link
                          to={modelVersionPath(projectId, {
                            modelId: registry.selectedVersion.modelId,
                            versionId: registry.selectedVersion.id,
                          })}
                        >
                          {text.modelVersionOpenPage}
                        </Link>
                        <DetailsList
                          entries={[
                            [text.version, registry.selectedVersion.version],
                            [
                              text.parents,
                              registry.selectedVersion.parentModelVersionIds.length
                                ? registry.selectedVersion.parentModelVersionIds.map((id) => (
                                    <ModelVersionNameLink
                                      key={id}
                                      projectId={projectId}
                                      versionId={id}
                                    />
                                  ))
                                : null,
                            ],
                            [
                              text.weightsUri,
                              registry.selectedVersion.weightsUri ? (
                                <span className="mono break-word">
                                  {registry.selectedVersion.weightsUri}
                                </span>
                              ) : null,
                            ],
                            [
                              text.modelVersionWeightsArtifact,
                              <ModelVersionArtifactLink
                                projectId={projectId}
                                version={registry.selectedVersion}
                              />,
                            ],
                            [
                              text.defaultCode,
                              registry.selectedVersion.defaultCodeVersionId ? (
                                <CodeVersionNameLink
                                  projectId={projectId}
                                  codeVersionId={registry.selectedVersion.defaultCodeVersionId}
                                />
                              ) : null,
                            ],
                          ]}
                        />
                        <h3>{text.metadata}</h3>
                        <JsonDetails value={registry.selectedVersion.metadata} />
                      </div>
                    )}
                  </>
                )}
              </Resource>
              <FamilyCodeVersions projectId={projectId} family={registry.selected.family} />
              <ModelAliasHistory history={aliasHistory} />
            </>
          ) : (
            <Empty>{text.selectItem}</Empty>
          )}
        </RegistryLayout>
      )}
    </Resource>
  );
}
