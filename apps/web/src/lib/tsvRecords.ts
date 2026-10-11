// Records of TSV text: one record per line, fields split at every tab. TSV has no quoting (the
// IANA text/tab-separated-values form), so a quote is part of the value and never spans lines.

const TSV_DELIMITER = '\t';

export interface TsvRecord {
  /** 1-based line in the file. */
  line: number;
  fields: string[];
}

/** Blank lines are skipped, as CSV skips them. */
export function readTsvRecords(content: string): TsvRecord[] {
  const records: TsvRecord[] = [];
  content.split(/\r\n|\n|\r/).forEach((source, index) => {
    if (source !== '') records.push({ line: index + 1, fields: source.split(TSV_DELIMITER) });
  });
  return records;
}
