import type { ModelAliasEvent } from '@mmt/contracts';
import { ResponsiveTable } from './ResponsiveTable';
import { ErrorNotice } from './Feedback';
import type { ModelAliasHistoryState } from '../hooks/useModelAliasHistory';
import { formatDate } from '../lib/format';
import { useLocale } from '../i18n/useLocale';
import { modelAliasSourceLabels, modelsText } from '../i18n/models';
import { text } from '../i18n/catalog';

function actorLabel(event: ModelAliasEvent): string {
  if (!event.actor) return modelsText.aliasActorSystem;
  return event.actor.tokenId
    ? `${event.actor.displayName} (${modelsText.aliasActorToken})`
    : event.actor.displayName;
}

const versionLabel = (version: string | null) => version ?? modelsText.aliasUnassigned;

/** 1つのモデルのaliasの変更履歴（追記のみ）を新しい順に並べる。 */
export function ModelAliasHistory({ history }: { history: ModelAliasHistoryState }) {
  useLocale();
  return (
    <>
      <h3>{modelsText.aliasHistory}</h3>
      <ErrorNotice message={history.error} retry={history.reload} />
      <ResponsiveTable
        rows={history.items}
        rowKey={(event) => event.id}
        empty={history.loading ? text.loading : modelsText.aliasHistoryEmpty}
        columns={[
          {
            key: 'createdAt',
            priority: 'primary',
            header: modelsText.aliasChangedAt,
            render: (event) => formatDate(event.createdAt),
          },
          { key: 'alias', priority: 'primary', header: text.alias, className: 'mono', render: (event) => event.alias },
          {
            key: 'versions',
            priority: 'primary',
            header: modelsText.aliasVersionChange,
            className: 'mono alias-version-change',
            render: (event) =>
              `${versionLabel(event.previousVersion)} → ${versionLabel(event.version)}`,
          },
          { key: 'actor', priority: 'secondary', header: modelsText.aliasActor, render: actorLabel },
          {
            key: 'source',
            priority: 'secondary',
            header: modelsText.aliasSource,
            render: (event) => modelAliasSourceLabels[event.source],
          },
          {
            key: 'reason',
            priority: 'secondary',
            header: modelsText.aliasReason,
            className: 'break-word alias-reason',
            // 自動の昇格はすべての基準を説明するので、行にはその冒頭を出す。
            render: (event) =>
              event.reason ? <span title={event.reason}>{event.reason}</span> : '—',
          },
        ]}
      />
      {history.hasMore && (
        <div className="section-actions">
          <button className="button small" disabled={history.loading} onClick={history.loadMore}>
            {modelsText.aliasHistoryLoadMore}
          </button>
        </div>
      )}
    </>
  );
}
