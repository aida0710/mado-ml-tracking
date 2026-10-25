import { useState, type ReactNode } from 'react';
import type { Artifact } from '@mmt/contracts';
import { useEvaluationSampleAudio } from '../../hooks/useEvaluationSampleAudio';
import { narrowerThan } from '@mado/design-system/layout';
import { useMediaQuery } from '@mado/design-system/react';
import {
  paginate,
  sortEvaluationSamples,
  type EvaluationSampleOrder,
  type EvaluationSampleTable,
} from '../../lib/evaluationSamples';
import { ErrorNotice } from '../Feedback';
import { BrokenRowCount, BrokenRowsDetails } from './BrokenRowsDetails';
import { EvaluationSampleCards } from './EvaluationSampleCards';
import { EvaluationSampleRows } from './EvaluationSampleRows';
import { useLocalizedMemo } from '../../i18n/useLocalizedMemo';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';
import { artifactsTextTemplates } from '../../i18n/artifacts';

/**
 * 評価サンプル（音声、reference、prediction、score）を、並べ替え、差分の強調、50件ずつの
 * ページ付きで出す。スマートフォン（640px未満）では5列の表の代わりに1件1枚のカードを出す。
 */
export function EvaluationSamplesTable({
  artifact,
  table,
  formatSelect,
}: {
  artifact: Artifact;
  table: EvaluationSampleTable;
  /** ［表示形式］のselect。このファイルをテキストに切り替える。 */
  formatSelect: ReactNode;
}) {
  useLocale();
  const isPhone = useMediaQuery(narrowerThan('sm'));
  const [order, setOrder] = useState<EvaluationSampleOrder>('line');
  const [page, setPage] = useState(0);
  const [highlightDiff, setHighlightDiff] = useState(true);
  const [expandedLine, setExpandedLine] = useState<number | null>(null);
  const sorted = useLocalizedMemo(() => sortEvaluationSamples(table.samples, order), [table.samples, order]);
  const current = paginate(sorted, page);
  const sampleAudio = useEvaluationSampleAudio(artifact, current.items);
  const changePage = (next: number) => {
    setPage(next);
    setExpandedLine(null);
  };
  const SampleList = isPhone ? EvaluationSampleCards : EvaluationSampleRows;

  return (
    <div className="evaluation-samples">
      <div className="evaluation-samples-toolbar">
        <span>{artifactsTextTemplates.evaluationSampleCount(table.samples.length)}</span>
        <BrokenRowCount errors={table.errors} />
        <label className="audio-viewer-select">
          {text.sort}
          <select
            value={order}
            onChange={(event) => {
              setOrder(event.target.value as EvaluationSampleOrder);
              changePage(0);
            }}
          >
            <option value="line">{text.evaluationOrderLine}</option>
            <option value="score_asc">{text.evaluationOrderScoreAscending}</option>
            <option value="score_desc">{text.evaluationOrderScoreDescending}</option>
          </select>
        </label>
        <label className="evaluation-toggle">
          <input type="checkbox" checked={highlightDiff} onChange={(event) => setHighlightDiff(event.target.checked)} />
          {text.evaluationHighlightDiff}
        </label>
        <span className="preview-toolbar-end">{formatSelect}</span>
      </div>
      <BrokenRowsDetails errors={table.errors} />
      <ErrorNotice message={sampleAudio.error} retry={sampleAudio.reload} />
      <SampleList
        samples={current.items}
        audios={sampleAudio.audios}
        highlightDiff={highlightDiff}
        expandedLine={expandedLine}
        onToggleExpanded={(line) => setExpandedLine(expandedLine === line ? null : line)}
      />
      {current.pageCount > 1 && (
        <nav className="section-actions evaluation-pagination" aria-label={text.evaluationPagination}>
          <button type="button" className="button small" disabled={current.page === 0} onClick={() => changePage(current.page - 1)}>
            {text.previousPage}
          </button>
          <span>{artifactsTextTemplates.evaluationPage(current.page + 1, current.pageCount)}</span>
          <button
            type="button"
            className="button small"
            disabled={current.page + 1 >= current.pageCount}
            onClick={() => changePage(current.page + 1)}
          >
            {text.nextPage}
          </button>
        </nav>
      )}
    </div>
  );
}
