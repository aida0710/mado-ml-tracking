// Text files that hold a table (CSV, TSV, JSON Lines): detecting the format and reading the rows.
// Broken rows are counted with their line, never repaired.

import { readCsvRecords } from './csvRecords';
import { readTsvRecords } from './tsvRecords';

export type TabularTextFormat = 'jsonl' | 'csv' | 'tsv';
export type TabularRowErrorReason = 'invalid_json' | 'not_object' | 'column_count' | 'unterminated_quote';

export interface TabularRecord {
  /** 1-based line in the file where the row starts. */
  line: number;
  /**
   * One value per column, in column order. CSV and TSV values are strings; JSON Lines values are
   * the parsed JSON values, and undefined where the row has no such key.
   */
  cells: unknown[];
}
export interface TabularRowError {
  line: number;
  reason: TabularRowErrorReason;
}
export interface TabularText {
  columns: string[];
  records: TabularRecord[];
  errors: TabularRowError[];
}

const BYTE_ORDER_MARK = '﻿';

export function tabularTextFormat(path: string, mimeType: string): TabularTextFormat | null {
  const essence = mimeType.split(';')[0]!.trim().toLowerCase();
  const lowerPath = path.toLowerCase();
  if (essence === 'application/x-ndjson' || /\.(jsonl|ndjson)$/.test(lowerPath)) return 'jsonl';
  if (essence === 'text/csv' || lowerPath.endsWith('.csv')) return 'csv';
  if (essence === 'text/tab-separated-values' || lowerPath.endsWith('.tsv')) return 'tsv';
  return null;
}

/** Columns are the keys of every row's object, in the order they first appear. */
function parseJsonLines(content: string): TabularText {
  const columnIndexes = new Map<string, number>();
  const objects: Array<{ line: number; value: Record<string, unknown> }> = [];
  const errors: TabularRowError[] = [];
  content.split(/\r?\n/).forEach((source, index) => {
    if (source.trim() === '') return;
    const line = index + 1;
    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch {
      errors.push({ line, reason: 'invalid_json' });
      return;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push({ line, reason: 'not_object' });
      return;
    }
    for (const key of Object.keys(value)) if (!columnIndexes.has(key)) columnIndexes.set(key, columnIndexes.size);
    objects.push({ line, value: value as Record<string, unknown> });
  });
  const columns = [...columnIndexes.keys()];
  const records = objects.map(({ line, value }) => ({
    line,
    cells: columns.map((column) => (Object.hasOwn(value, column) ? value[column] : undefined)),
  }));
  return { columns, records, errors };
}

/** A CSV or TSV record; only a CSV record can end inside an unclosed quote. */
interface DelimitedRecord {
  line: number;
  fields: string[];
  unterminated?: boolean;
}

/** The first record is the header; rows with a different number of fields are errors. */
function parseDelimited(delimitedRecords: readonly DelimitedRecord[]): TabularText {
  const [header, ...rows] = delimitedRecords;
  if (!header) return { columns: [], records: [], errors: [] };
  const columns = header.fields.map((name) => name.trim());
  const records: TabularRecord[] = [];
  const errors: TabularRowError[] = [];
  for (const row of rows) {
    if (row.unterminated) errors.push({ line: row.line, reason: 'unterminated_quote' });
    else if (row.fields.length !== columns.length) errors.push({ line: row.line, reason: 'column_count' });
    else records.push({ line: row.line, cells: row.fields });
  }
  return { columns, records, errors };
}

export function parseTabularText(content: string, format: TabularTextFormat): TabularText {
  const withoutBom = content.startsWith(BYTE_ORDER_MARK) ? content.slice(1) : content;
  if (format === 'jsonl') return parseJsonLines(withoutBom);
  return parseDelimited(format === 'csv' ? readCsvRecords(withoutBom) : readTsvRecords(withoutBom));
}
