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
  shownRunColumns,
  ShownRunsCheckbox,
  type RunListSelection,
} from './RunTableCells';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

// One arrow key press widens or narrows a column by this much, like a coarse mouse drag.
const KEYBOARD_RESIZE_STEP = 16;

const widthStyle = (width: number | undefined): CSSProperties | undefined =>
  width === undefined ? undefined : { width, minWidth: width, maxWidth: width };

/**
 * The Run list at --bp-sm and wider: every chosen column in the row, each one movable by dragging
 * its header (or Alt+arrow keys) and resizable by its border (or arrow keys on the border).
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
  // While the pointer drags a border the width lives here, so the list commits one change.
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
      {/* Read with each column name: the name is a focus stop only for this key. */}
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
                  // A focusable separator is a splitter, whose value assistive technology reads.
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
