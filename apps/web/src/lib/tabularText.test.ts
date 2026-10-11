import { describe, expect, it } from 'vitest';
import { parseTabularText, tabularTextFormat } from './tabularText';

describe('表として読むテキストの形式', () => {
  it('拡張子とMIMEからjsonl・csv・tsvを判定し、それ以外は表にしない', () => {
    expect(tabularTextFormat('eval/results.jsonl', 'application/octet-stream')).toBe('jsonl');
    expect(tabularTextFormat('x', 'application/x-ndjson; charset=utf-8')).toBe('jsonl');
    expect(tabularTextFormat('eval/results.CSV', 'text/plain')).toBe('csv');
    expect(tabularTextFormat('metrics.tsv', 'text/plain')).toBe('tsv');
    expect(tabularTextFormat('x', 'text/tab-separated-values')).toBe('tsv');
    expect(tabularTextFormat('notes.txt', 'text/plain')).toBeNull();
  });
});

describe('表の読み込み', () => {
  it('csvは1行目を見出しにし、列数の違う行と閉じない引用符を行番号つきのエラーにする', () => {
    const table = parseTabularText('﻿id,text,cer\r\n1,"a,b",0.1\r\n2,x\r\n3,"閉じない,0.3\r\n', 'csv');
    expect(table.columns).toEqual(['id', 'text', 'cer']);
    expect(table.records).toEqual([{ line: 2, cells: ['1', 'a,b', '0.1'] }]);
    expect(table.errors).toEqual([
      { line: 3, reason: 'column_count' },
      { line: 4, reason: 'unterminated_quote' },
    ]);
  });

  it('tsvはタブで区切り、カンマは値の一部として読む', () => {
    const table = parseTabularText('step\tnote\n1\ta, b\n', 'tsv');
    expect(table.columns).toEqual(['step', 'note']);
    expect(table.records).toEqual([{ line: 2, cells: ['1', 'a, b'] }]);
  });

  it('tsvは引用符を解釈せず、文頭の " も閉じない " も値のまま1行ずつ読む', () => {
    const table = parseTabularText('id\ttext\r\n1\t"quoted" start\r\n2\t"閉じない\r\n3\tsays "hi"\r\n', 'tsv');
    expect(table.records).toEqual([
      { line: 2, cells: ['1', '"quoted" start'] },
      { line: 3, cells: ['2', '"閉じない'] },
      { line: 4, cells: ['3', 'says "hi"'] },
    ]);
    expect(table.errors).toEqual([]);
  });

  it('tsvの列数の違う行は、その行だけを行番号つきのエラーにする', () => {
    const table = parseTabularText('a\tb\n1\n\n2\t3\n', 'tsv');
    expect(table.records).toEqual([{ line: 4, cells: ['2', '3'] }]);
    expect(table.errors).toEqual([{ line: 2, reason: 'column_count' }]);
  });

  it('jsonlは全行のキーを最初に出た順で列にし、無いキーは空のまま、値はJSONの型のまま残す', () => {
    const table = parseTabularText(
      ['{"id":1,"ok":true}', '', '{"id":2,"extra":{"a":1}}', 'not json', '"text"'].join('\n'),
      'jsonl',
    );
    expect(table.columns).toEqual(['id', 'ok', 'extra']);
    expect(table.records).toEqual([
      { line: 1, cells: [1, true, undefined] },
      { line: 3, cells: [2, undefined, { a: 1 }] },
    ]);
    expect(table.errors).toEqual([
      { line: 4, reason: 'invalid_json' },
      { line: 5, reason: 'not_object' },
    ]);
  });

  it('空のファイルは列も行も無い表になる', () => {
    expect(parseTabularText('', 'csv')).toEqual({ columns: [], records: [], errors: [] });
    expect(parseTabularText('\n\n', 'jsonl')).toEqual({ columns: [], records: [], errors: [] });
  });
});
