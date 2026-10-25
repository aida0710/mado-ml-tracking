import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Experiment } from '@mmt/contracts';
import type { QueryState } from '../../hooks/useQuery';
import { Resource } from '../Feedback';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

export function ExperimentSidebar({
  experiments,
  selectedExperimentId,
  canEdit,
  onSelect,
  onCreate,
}: {
  experiments: QueryState<Experiment[]>;
  selectedExperimentId: string;
  canEdit: boolean;
  onSelect: (experimentId: string) => void;
  onCreate: () => void;
}) {
  useLocale();
  const [experimentSearch, setExperimentSearch] = useState('');
  return (
    <aside className="experiment-sidebar">
      <div className="sidebar-heading">
        <span>{text.experiments}</span>
        {canEdit && (
          <button className="icon-button" aria-label={text.newExperiment} onClick={onCreate}>
            <Plus size={18} />
          </button>
        )}
      </div>
      <input
        className="sidebar-search"
        aria-label={text.filterExperiments}
        placeholder={text.filterExperiments}
        value={experimentSearch}
        onChange={(event) => setExperimentSearch(event.target.value)}
      />
      <button
        className={`experiment-item ${!selectedExperimentId ? 'active' : ''}`}
        onClick={() => onSelect('')}
      >
        {text.allExperiments}
      </button>
      <Resource query={experiments}>
        {(items) => {
          const shownItems = items.filter((item) =>
            item.name.toLowerCase().includes(experimentSearch.toLowerCase()),
          );
          const emptyMessage = sidebarEmptyMessage({
            hasExperiments: items.length > 0,
            hasMatches: shownItems.length > 0,
            canEdit,
          });
          return (
            <>
              {shownItems.map((item) => (
                <button
                  key={item.id}
                  className={`experiment-item ${item.id === selectedExperimentId ? 'active' : ''}`}
                  onClick={() => onSelect(item.id)}
                >
                  <span>{item.name}</span>
                  <small>{textTemplates.runCount(item.runCount)}</small>
                </button>
              ))}
              {emptyMessage && <p className="experiment-sidebar-empty">{emptyMessage}</p>}
            </>
          );
        }}
      </Resource>
    </aside>
  );
}

/**
 * Experimentが1つも出ないときは、ページの大きな空の表示ではなく一覧自身の短い1行を出す。
 * スマートフォンでは一覧は短いスクロールの箱で、背の高いメッセージは下端で切れてしまう。
 */
function sidebarEmptyMessage(state: {
  hasExperiments: boolean;
  hasMatches: boolean;
  canEdit: boolean;
}): string | null {
  if (!state.hasExperiments)
    return state.canEdit ? text.experimentSidebarEmpty : text.experimentsNoneForViewer;
  return state.hasMatches ? null : text.experimentSidebarNoMatch;
}
