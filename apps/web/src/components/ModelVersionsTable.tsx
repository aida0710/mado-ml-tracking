import { useLocale } from '../i18n/useLocale';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ModelVersion } from '@mmt/contracts';
import { ResponsiveTable } from './ResponsiveTable';
import { RunNameLink } from './RunNameLink';
import { formatDate } from '../lib/format';
import { modelVersionPath } from '../lib/modelVersionPath';
import { text } from '../i18n/catalog';
import { modelsTextTemplates } from '../i18n/models';

// The newest versions shown at first; a Model with hundreds of versions would push its alias
// history far down the page.
const INITIAL_VERSION_ROWS = 20;

/** A Model's versions, newest first, with the aliases that point at each one. */
export function ModelVersionsTable({
  projectId,
  versions,
  aliases,
  selectedVersionId,
}: {
  projectId: string;
  versions: ModelVersion[];
  /** The Model's aliases: alias name → version id. */
  aliases: Record<string, string>;
  selectedVersionId?: string;
}) {
  useLocale();
  const [shownCount, setShownCount] = useState(INITIAL_VERSION_ROWS);
  // A version chosen further down (from a link) stays in the list.
  const selectedIndex = versions.findIndex((version) => version.id === selectedVersionId);
  const visibleCount = Math.max(shownCount, selectedIndex + 1);
  const aliasesOf = (versionId: string) =>
    Object.entries(aliases)
      .filter(([, aliasVersionId]) => aliasVersionId === versionId)
      .map(([alias]) => alias);
  return (
    <>
      <ResponsiveTable
        rows={versions.slice(0, visibleCount)}
        rowKey={(version) => version.id}
        selectedKey={selectedVersionId}
        columns={[
          {
            key: 'version',
            priority: 'primary',
            header: text.version,
            render: (version) => (
              <Link
                className="mono"
                to={modelVersionPath(projectId, { modelId: version.modelId, versionId: version.id })}
              >
                {version.version}
              </Link>
            ),
          },
          {
            key: 'source',
            priority: 'primary',
            header: text.sourceRun,
            render: (version) =>
              version.sourceRunId ? (
                <RunNameLink projectId={projectId} runId={version.sourceRunId} />
              ) : (
                '—'
              ),
          },
          {
            key: 'aliases',
            priority: 'primary',
            header: text.alias,
            className: 'mono',
            render: (version) => aliasesOf(version.id).join(', ') || '—',
          },
          {
            key: 'created',
            priority: 'secondary',
            header: text.created,
            render: (version) => formatDate(version.createdAt),
          },
        ]}
      />
      {visibleCount < versions.length && (
        <div className="section-actions">
          <span className="muted">
            {modelsTextTemplates.versionsShown(visibleCount, versions.length)}
          </span>
          <button
            className="button small"
            onClick={() => setShownCount(visibleCount + INITIAL_VERSION_ROWS)}
          >
            {text.loadMore}
          </button>
        </div>
      )}
    </>
  );
}
