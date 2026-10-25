import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ModelVersion } from '@mmt/contracts';
import { ResponsiveTable } from './ResponsiveTable';
import { RunNameLink } from './RunNameLink';
import { getModelTrainingSourceRunId } from '../lib/modelTrainingSource';
import { formatDate } from '../lib/format';
import { modelVersionPath } from '../lib/modelVersionPath';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { modelsTextTemplates } from '../i18n/models';
import { formatList } from '../i18n/textJoining';

// 最初は新しいバージョンだけを出す。何百ものバージョンがあるモデルでは、aliasの履歴が
// ページのずっと下へ押しやられてしまう。
const INITIAL_VERSION_ROWS = 20;

/** モデルのバージョンを新しい順に並べ、それぞれを指すaliasを添える。 */
export function ModelVersionsTable({
  projectId,
  versions,
  aliases,
  selectedVersionId,
}: {
  projectId: string;
  versions: ModelVersion[];
  /** モデルのalias。alias名 → バージョンのid。 */
  aliases: Record<string, string>;
  selectedVersionId?: string;
}) {
  useLocale();
  const [shownCount, setShownCount] = useState(INITIAL_VERSION_ROWS);
  // （リンクから）一覧の下の方のバージョンを選んだときも、一覧に残す。
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
                to={modelVersionPath(projectId, {
                  modelId: version.modelId,
                  versionId: version.id,
                })}
              >
                {version.version}
              </Link>
            ),
          },
          {
            key: 'source',
            priority: 'primary',
            header: text.sourceRun,
            render: (version) => {
              const sourceRunId = getModelTrainingSourceRunId(version);
              return sourceRunId ? <RunNameLink projectId={projectId} runId={sourceRunId} /> : '—';
            },
          },
          {
            key: 'aliases',
            priority: 'primary',
            header: text.alias,
            className: 'mono',
            render: (version) => formatList(aliasesOf(version.id)) || '—',
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
