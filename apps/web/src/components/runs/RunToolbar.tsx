import { useState } from 'react';
import { Columns3, Download, Search } from 'lucide-react';
import type { RunKind, RunStatus } from '@mmt/contracts';
import { ErrorNotice } from '../Feedback';
import {
  findRunFilterSyntaxError,
  metricRunSort,
  parseMetricRunSort,
  toRunSearchConditions,
} from '../../lib/runFilter';
import { suggestRunFilter } from '../../lib/runFilterSuggestion';
import { RUN_KINDS } from '../../lib/runListUrl';
import { detailsPopoverHandlers } from '../../lib/detailsPopover';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';
import { joinLabels } from '../../i18n/textJoining';

const runStatuses: RunStatus[] = ['queued', 'running', 'finished', 'failed', 'canceled'];
// selectで選ぶ種類は1つ。APIで複数を指定して保存したビューは、それを1つの選択肢として残す。
const KIND_OPTION_SEPARATOR = ',';

export function RunToolbar({
  searchText,
  filterRejection,
  status,
  kinds,
  sort,
  metricNames,
  columnNames,
  isColumnVisible,
  onSearch,
  onStatusChange,
  onKindsChange,
  onSortChange,
  onColumnToggle,
  exportingCsv,
  onExportCsv,
}: {
  searchText: string;
  /** 検索したフィルタをAPIが拒んだ理由。構文エラーと同じように出し、再試行は付けない。 */
  filterRejection: string | null;
  status: string;
  kinds: RunKind[];
  sort: string;
  metricNames: string[];
  columnNames: string[];
  isColumnVisible: (name: string) => boolean;
  onSearch: (searchText: string) => void;
  onStatusChange: (status: string) => void;
  onKindsChange: (kinds: RunKind[]) => void;
  onSortChange: (sort: string) => void;
  onColumnToggle: (name: string) => void;
  exportingCsv: boolean;
  /** 出ているページだけでなく、今の検索のRunをすべて書き出す。 */
  onExportCsv: () => void;
}) {
  useLocale();
  const [searchInput, setSearchInput] = useState(searchText);
  // 前回の検索で拒まれたフィルタ。メッセージは描画のたびに文章にするので、表示言語を
  // 変えても追従する。
  const [rejectedFilter, setRejectedFilter] = useState<string | null>(null);
  // ほかの場所で適用した検索（保存ビュー、アドレス）は、ここに入力したものを置き換える。
  const [appliedSearchText, setAppliedSearchText] = useState(searchText);
  if (appliedSearchText !== searchText) {
    setAppliedSearchText(searchText);
    setSearchInput(searchText);
    setRejectedFilter(null);
  }
  const kindValue = kinds.join(KIND_OPTION_SEPARATOR);
  const sortedMetric = parseMetricRunSort(sort);
  // このページにそのメトリクスが無くても、今のメトリクスでの並べ替えを選べるように残す。
  const sortMetricNames =
    sortedMetric && !metricNames.includes(sortedMetric.key)
      ? [sortedMetric.key, ...metricNames]
      : metricNames;

  const syntaxError = rejectedFilter === null ? null : findRunFilterSyntaxError(rejectedFilter);
  const filterError = syntaxError ?? filterRejection;
  // `loss < 0.2`のような比較をRunの名前として検索したなら、たぶんメトリクスのつもりだった。
  const suggestedFilter = suggestRunFilter(searchText);

  function submitSearch(input = searchInput) {
    const conditions = toRunSearchConditions(input);
    const filter = 'filter' in conditions ? conditions.filter : null;
    const isRefused = filter !== null && findRunFilterSyntaxError(filter) !== null;
    setRejectedFilter(isRefused ? filter : null);
    if (!isRefused) onSearch(input.trim());
  }

  return (
    <>
      <div className="toolbar">
        <form
          className="toolbar-search"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <Search size={16} />
          <input
            aria-label={text.search}
            aria-invalid={filterError ? true : undefined}
            placeholder={text.queryHint}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button className="button small" type="submit">
            {text.filter}
          </button>
        </form>
        <label className="toolbar-item">
          <span>{text.status}</span>
          <select
            aria-label={text.status}
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
          >
            <option value="">{text.allStatus}</option>
            {runStatuses.map((value) => (
              <option key={value} value={value}>
                {text[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-item">
          <span>{text.kind}</span>
          <select
            aria-label={text.kind}
            value={kindValue}
            onChange={(event) =>
              onKindsChange(
                event.target.value
                  ? (event.target.value.split(KIND_OPTION_SEPARATOR) as RunKind[])
                  : [],
              )
            }
          >
            <option value="">{text.allKinds}</option>
            {kinds.length > 1 && (
              <option value={kindValue}>{joinLabels(kinds.map((kind) => text[kind]))}</option>
            )}
            {RUN_KINDS.map((value) => (
              <option key={value} value={value}>
                {text[value]}
              </option>
            ))}
          </select>
        </label>
        <details className="column-menu" {...detailsPopoverHandlers}>
          <summary>
            <Columns3 size={15} />
            {text.columns}
          </summary>
          <div className="popover">
            {columnNames.map((name) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={isColumnVisible(name)}
                  onChange={() => onColumnToggle(name)}
                />
                {name in text ? text[name as keyof typeof text] : name}
              </label>
            ))}
          </div>
        </details>
        <label className="toolbar-item">
          <span>{text.sort}</span>
          <select
            aria-label={text.sort}
            value={sort}
            onChange={(event) => onSortChange(event.target.value)}
          >
            <option value="newest">{text.newest}</option>
            <option value="oldest">{text.oldest}</option>
            <option value="name">{text.byName}</option>
            {sortMetricNames.flatMap((name) => [
              <option key={`${name}:desc`} value={metricRunSort(name, 'desc')}>
                {textTemplates.metricDescending(`metrics.${name}`)}
              </option>,
              <option key={`${name}:asc`} value={metricRunSort(name, 'asc')}>
                {textTemplates.metricAscending(`metrics.${name}`)}
              </option>,
            ])}
          </select>
        </label>
        <button
          className="button small"
          type="button"
          disabled={exportingCsv}
          onClick={onExportCsv}
        >
          <Download size={15} />
          {exportingCsv ? text.exportingRunsCsv : text.exportRunsCsv}
        </button>
      </div>
      <ErrorNotice message={filterError} />
      {suggestedFilter && !filterError && (
        <p className="notice action-notice" role="status">
          {textTemplates.filterSuggestion(searchText, suggestedFilter)}{' '}
          <button
            type="button"
            className="button small"
            onClick={() => submitSearch(suggestedFilter)}
          >
            {text.searchWithSuggestion}
          </button>
        </p>
      )}
    </>
  );
}
