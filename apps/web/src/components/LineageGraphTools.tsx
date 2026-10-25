import { Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LineageInteractionState } from '../types/lineage';
import { lineageNodeUrl } from '../lib/lineageNodeUrl';
import { useLocale } from '../i18n/useLocale';
import { lineageNodeKindLabels } from '../i18n/catalog';
import { lineageText, lineageTextTemplates } from '../i18n/lineage';

// Same bounded result list as Data Catalog; the full graph remains available below it.
const SEARCH_RESULT_LIMIT = 8;

export function LineageGraphTools({
  interaction,
  projectId,
}: {
  interaction: LineageInteractionState;
  projectId: string;
}) {
  useLocale();
  const visibleSearchResults = interaction.searchResults.slice(0, SEARCH_RESULT_LIMIT);
  const selectedNode = interaction.selectedNode;
  return (
    <div className="lineage-graph-tools">
      <div className="lineage-graph-search">
        <label className="lineage-search-field">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">{lineageText.lineageSearch}</span>
          <input
            type="search"
            value={interaction.query}
            onChange={(event) => interaction.setQuery(event.target.value)}
            placeholder={lineageText.lineageSearchPlaceholder}
            autoComplete="off"
          />
        </label>
        {interaction.query.trim() && (
          <div
            className="popover menu lineage-search-results"
            role="region"
            aria-label={lineageText.lineageSearchResults}
          >
            {visibleSearchResults.length ? (
              <ul>
                {visibleSearchResults.map((node) => (
                  <li key={node.id}>
                    <button type="button" className="menu-item" onClick={() => interaction.selectNode(node.id)}>
                      <strong>{node.label}</strong>
                      <span>{lineageNodeKindLabels[node.kind]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{lineageText.lineageSearchEmpty}</p>
            )}
            {interaction.searchResults.length > visibleSearchResults.length && (
              <p className="muted">
                {lineageTextTemplates.lineageMoreResults(
                  interaction.searchResults.length - visibleSearchResults.length,
                )}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="lineage-direction" role="group" aria-label={lineageText.lineageDirection}>
        {(['both', 'upstream', 'downstream'] as const).map((direction) => (
          <button
            type="button"
            key={direction}
            aria-pressed={interaction.direction === direction}
            onClick={() => interaction.setDirection(direction)}
          >
            {lineageText[direction]}
          </button>
        ))}
      </div>
      {selectedNode && (
        <div className="lineage-selection" aria-live="polite">
          <span title={selectedNode.label}>{selectedNode.label}</span>
          <Link className="link-button" to={lineageNodeUrl(projectId, selectedNode)}>
            {lineageText.lineageOpenDetails}
          </Link>
          <button
            type="button"
            className="icon-button"
            onClick={interaction.clearSelection}
            aria-label={lineageText.lineageClearSelection}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
