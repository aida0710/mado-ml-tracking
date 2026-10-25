import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { Run, SavedViewColumn } from '@mmt/contracts';
import { useColumnHeaderWidths } from '../../hooks/useColumnHeaderWidths';
import {
  clampColumnWidth,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  moveColumn,
  resizeColumn,
  shiftColumn,
} from '../../lib/runColumns';
import {
  RunNameCell,
  RunSelectCheckbox,
  ShownRunsCheckbox,
  type RunListSelection,
} from './RunTableCells';
import { shownRunColumns } from './runTableColumns';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

// 矢印キーを1回押すと列をこれだけ広げるか狭める。大まかなマウスのドラッグに近い。
const KEYBOARD_RESIZE_STEP = 16;

const widthStyle = (width: number | undefined): CSSProperties | undefined =>
  width === undefined ? undefined : { width, minWidth: width, maxWidth: width };

/**
 * 640px以上のRunの一覧。選んだ列をすべて行に出す。各列は見出しをドラッグして（Alt+矢印キーでも）
 * 移動でき、境界をドラッグして（境界で矢印キーを押しても）幅を変えられる。
 */
export function WideRunTable({
  projectId,
  runs,
  columns,
  onColumnsChange,
  selection,
}: {
  projectId: string;
  runs: Run[];
  columns: SavedViewColumn[];
  onColumnsChange: (columns: SavedViewColumn[]) => void;
  selection: RunListSelection;
}) {
  useLocale();
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const headerWidths = useColumnHeaderWidths(tableRef);
  const moveHintId = useId();
  // ポインタで境界をドラッグする間は幅をここに持ち、一覧には変更を1回だけ確定する。
  const [resizing, setResizing] = useState<{ key: string; startX: number; startWidth: number; width: number } | null>(null);
  const shownColumns = shownRunColumns(columns).map((column) =>
    resizing?.key === column.key ? { ...column, width: resizing.width } : column,
  );

  function startResize(event: PointerEvent<HTMLSpanElement>, key: string) {
    const header = event.currentTarget.closest('th');
    if (!header) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startWidth = header.getBoundingClientRect().width;
    setResizing({ key, startX: event.clientX, startWidth, width: clampColumnWidth(startWidth) });
  }
  function moveResize(event: PointerEvent<HTMLSpanElement>) {
    if (!resizing) return;
    const width = clampColumnWidth(resizing.startWidth + event.clientX - resizing.startX);
    setResizing({ ...resizing, width });
  }
  function finishResize() {
    if (!resizing) return;
    onColumnsChange(resizeColumn(columns, resizing.key, resizing.width));
    setResizing(null);
  }
  function resizeWithKeyboard(event: KeyboardEvent<HTMLSpanElement>, key: string) {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const header = event.currentTarget.closest('th');
    if (!direction || !header) return;
    event.preventDefault();
    const current = columns.find((column) => column.key === key)?.width;
    const width = (current ?? header.getBoundingClientRect().width) + direction * KEYBOARD_RESIZE_STEP;
    onColumnsChange(resizeColumn(columns, key, width));
  }
  function moveWithKeyboard(event: KeyboardEvent<HTMLSpanElement>, key: string) {
    if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    onColumnsChange(shiftColumn(columns, key, event.key === 'ArrowLeft' ? -1 : 1));
  }

  return (
    <div className="table-scroll">
      {/* 各列の名前と一緒に読ませる。名前がフォーカスの止まる場所になるのは、このキーのためだけ。 */}
      <span id={moveHintId} hidden>
        {text.runColumnMove}
      </span>
      <table className="run-table" ref={tableRef}>
        <thead>
          <tr>
            <th scope="col">
              <ShownRunsCheckbox selection={selection} />
            </th>
            <th scope="col">{text.runName}</th>
            {shownColumns.map((column) => (
              <th
                key={column.key}
                scope="col"
                data-column={column.key}
                className={`run-column-header ${column.className ?? ''} ${draggedKey === column.key ? 'dragging' : ''}`.trim()}
                style={widthStyle(column.width)}
                draggable={!resizing}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', column.key);
                  setDraggedKey(column.key);
                }}
                onDragOver={(event) => {
                  if (draggedKey) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggedKey) onColumnsChange(moveColumn(columns, draggedKey, column.key));
                  setDraggedKey(null);
                }}
                onDragEnd={() => setDraggedKey(null)}
              >
                <span
                  className="run-column-label"
                  tabIndex={0}
                  title={text.runColumnMove}
                  aria-describedby={moveHintId}
                  onKeyDown={(event) => moveWithKeyboard(event, column.key)}
                >
                  {column.label}
                </span>
                <span
                  className="run-column-resizer"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={text.runColumnResize}
                  // フォーカスできるseparatorはスプリッターになり、支援技術がその値を読む。
                  aria-valuenow={column.width ?? headerWidths[column.key] ?? MIN_COLUMN_WIDTH}
                  aria-valuemin={MIN_COLUMN_WIDTH}
                  aria-valuemax={MAX_COLUMN_WIDTH}
                  tabIndex={0}
                  onPointerDown={(event) => startResize(event, column.key)}
                  onPointerMove={moveResize}
                  onPointerUp={finishResize}
                  onPointerCancel={() => setResizing(null)}
                  onKeyDown={(event) => resizeWithKeyboard(event, column.key)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className={selection.isSelected(run.id) ? 'selected' : ''}>
              <td>
                <RunSelectCheckbox run={run} selection={selection} />
              </td>
              <td>
                <RunNameCell projectId={projectId} run={run} />
              </td>
              {shownColumns.map((column) => (
                <td
                  key={column.key}
                  className={`${column.className ?? ''} ${column.width === undefined ? '' : 'sized'}`.trim()}
                  style={widthStyle(column.width)}
                >
                  {column.render(run)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
