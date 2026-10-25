import { useState } from 'react';
import { ArrowDown, ArrowUp, Settings2, Trash2 } from 'lucide-react';
import { REPORT_MARKDOWN_MAX_LENGTH, type ReportBlock, type ReportBlockSnapshot } from '@mmt/contracts';
import { MarkdownEditor } from '../markdown/MarkdownEditor';
import { EmbedPicker } from './EmbedPicker';
import { ReportBlockView } from './ReportBlockView';
import { reportBlockProblem } from '../../lib/reportBlocks';
import { useLocale } from '../../i18n/useLocale';
import { reportBlockProblemLabels, reportBlockTypeLabels } from '../../i18n/reports';
import { text } from '../../i18n/catalog';

/**
 * 編集画面の1つのブロック。レポートの中の位置、Markdownの本文か埋め込みの設定、読み手に
 * 見えるとおりに描いたプレビュー。
 */
export function ReportBlockEditor({
  projectId,
  block,
  isFirst,
  isLast,
  savedSnapshot,
  isRefreshRequested,
  onChange,
  onMove,
  onRemove,
  onRefreshRequestedChange,
}: {
  projectId: string;
  block: ReportBlock;
  isFirst: boolean;
  isLast: boolean;
  /** 保存したスナップショット。編集中のバージョンからブロックを変えていない間だけ渡す。 */
  savedSnapshot: ReportBlockSnapshot | undefined;
  isRefreshRequested: boolean;
  onChange: (block: ReportBlock) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
  onRefreshRequestedChange: (isRequested: boolean) => void;
}) {
  useLocale();
  const [isPicking, setPicking] = useState(false);
  const problem = reportBlockProblem(block);
  // スナップショットの取り直しは保存時に行う。それまでプレビューは今のデータを出す。
  const previewSnapshot = isRefreshRequested ? undefined : savedSnapshot;
  return (
    <section className="report-block-editor" aria-label={reportBlockTypeLabels[block.type]}>
      <header className="report-block-toolbar">
        <strong>{reportBlockTypeLabels[block.type]}</strong>
        <div className="report-block-actions">
          {block.type !== 'markdown' && (
            <button type="button" className="button small" onClick={() => setPicking(true)}>
              <Settings2 size={14} />
              {text.reportBlockSettings}
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label={text.reportBlockMoveUp}
            title={text.reportBlockMoveUp}
            disabled={isFirst}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={text.reportBlockMoveDown}
            title={text.reportBlockMoveDown}
            disabled={isLast}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={text.reportBlockRemove}
            title={text.reportBlockRemove}
            onClick={onRemove}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>
      {block.type === 'markdown' ? (
        <MarkdownEditor
          label={text.reportMarkdownLabel}
          value={block.text}
          maxLength={REPORT_MARKDOWN_MAX_LENGTH}
          rows={6}
          onChange={(value) => onChange({ ...block, text: value })}
        />
      ) : (
        <>
          {problem ? (
            <p className="report-block-problem">{reportBlockProblemLabels[problem]}</p>
          ) : (
            <ReportBlockView projectId={projectId} block={block} snapshot={previewSnapshot} preview />
          )}
          {block.mode === 'snapshot' && savedSnapshot && (
            <label className="checkbox-field report-refresh-field">
              <input
                type="checkbox"
                checked={isRefreshRequested}
                onChange={(event) => onRefreshRequestedChange(event.target.checked)}
              />
              {text.reportSnapshotRefresh}
            </label>
          )}
        </>
      )}
      {isPicking && block.type !== 'markdown' && (
        <EmbedPicker
          projectId={projectId}
          initial={block}
          isNew={false}
          onClose={() => setPicking(false)}
          onApply={(next) => {
            setPicking(false);
            onChange(next);
          }}
        />
      )}
    </section>
  );
}
