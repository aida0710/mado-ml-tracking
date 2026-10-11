import { describe, expect, it } from 'vitest';
import { splitColumnsByPriority, type ColumnPriority } from './responsiveColumns';

const column = (key: string, priority: ColumnPriority) => ({ key, priority });
const keys = (columns: { key: string }[]) => columns.map((item) => item.key);

describe('splitColumnsByPriority', () => {
  const columns = [
    column('name', 'primary'),
    column('created', 'secondary'),
    column('status', 'primary'),
    column('owner', 'secondary'),
  ];

  it('広い幅では全列を行に並べ、開いたときの列は無い', () => {
    const split = splitColumnsByPriority(columns, false);
    expect(keys(split.rowColumns)).toEqual(['name', 'created', 'status', 'owner']);
    expect(split.detailColumns).toEqual([]);
  });

  it('狭い幅では primary だけを行に残し、secondary を開いたときの列へ回す', () => {
    const split = splitColumnsByPriority(columns, true);
    expect(keys(split.rowColumns)).toEqual(['name', 'status']);
    expect(keys(split.detailColumns)).toEqual(['created', 'owner']);
  });

  it('primary が1列も無い表は、狭い幅でも先頭の列を行に残す', () => {
    const split = splitColumnsByPriority(
      [column('name', 'secondary'), column('created', 'secondary')],
      true,
    );
    expect(keys(split.rowColumns)).toEqual(['name']);
    expect(keys(split.detailColumns)).toEqual(['created']);
  });

  it('detail の列は、広い幅でも行には並べず、開いたときだけ出す', () => {
    const withDetail = [...columns, column('criteria', 'detail')];
    const wide = splitColumnsByPriority(withDetail, false);
    expect(keys(wide.rowColumns)).toEqual(['name', 'created', 'status', 'owner']);
    expect(keys(wide.detailColumns)).toEqual(['criteria']);
    const narrow = splitColumnsByPriority(withDetail, true);
    expect(keys(narrow.rowColumns)).toEqual(['name', 'status']);
    expect(keys(narrow.detailColumns)).toEqual(['created', 'owner', 'criteria']);
  });
});
