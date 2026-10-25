import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

/** カーソルによるページ送り。総数が分からないので、ページ番号と戻る手段を出す。 */
export function RunPagination({
  pageNumber,
  shownCount,
  pageSize,
  hasNextPage,
  onFirst,
  onPrevious,
  onNext,
}: {
  pageNumber: number;
  shownCount: number;
  pageSize: number;
  hasNextPage: boolean;
  onFirst: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  useLocale();
  const isFirstPage = pageNumber === 1;
  return (
    <div className="table-footer">
      <span>
        {textTemplates.runCount(shownCount)} · {pageSize} / {text.page}
      </span>
      <span>
        {textTemplates.pageNumber(pageNumber)}
        <button
          className="icon-button"
          disabled={isFirstPage}
          aria-label={text.firstPage}
          onClick={onFirst}
        >
          «
        </button>
        <button
          className="icon-button"
          disabled={isFirstPage}
          aria-label={text.previousPage}
          onClick={onPrevious}
        >
          ‹
        </button>
        <button
          className="icon-button"
          disabled={!hasNextPage}
          aria-label={text.nextPage}
          onClick={onNext}
        >
          ›
        </button>
      </span>
    </div>
  );
}
