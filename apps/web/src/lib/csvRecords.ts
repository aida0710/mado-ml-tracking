// Records of CSV text, read as RFC 4180: quoted fields may hold commas, doubled quotes, and line
// breaks.

const CSV_DELIMITER = ',';

export interface CsvRecord {
  /** 1-based line in the file where the record starts. */
  line: number;
  fields: string[];
  /** The file ended inside a quoted field; the fields read so far are kept. */
  unterminated: boolean;
}

export function readCsvRecords(content: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  const endRecord = () => {
    fields.push(field);
    if (!(fields.length === 1 && fields[0] === '')) records.push({ line: recordLine, fields, unterminated: false });
    fields = [];
    field = '';
    recordLine = line;
  };
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else {
        if (character === '\n') line += 1;
        field += character;
      }
    } else if (character === '"' && field === '') quoted = true;
    else if (character === CSV_DELIMITER) {
      fields.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      line += 1;
      endRecord();
    } else field += character;
  }
  if (quoted) records.push({ line: recordLine, fields: [...fields, field], unterminated: true });
  else if (field !== '' || fields.length > 0) endRecord();
  return records;
}
