// TSVのテキストのレコード。1行が1レコードで、項目はタブごとに分ける。TSVには引用符の仕組みが
// 無い（IANAのtext/tab-separated-valuesの形式）ので、引用符は値の一部で、行をまたがない。

const TSV_DELIMITER = '\t';

export interface TsvRecord {
  /** ファイル内の行番号（1始まり）。 */
  line: number;
  fields: string[];
}

/** 空行は、CSVと同じく飛ばす。 */
export function readTsvRecords(content: string): TsvRecord[] {
  const records: TsvRecord[] = [];
  content.split(/\r\n|\n|\r/).forEach((source, index) => {
    if (source !== '') records.push({ line: index + 1, fields: source.split(TSV_DELIMITER) });
  });
  return records;
}
