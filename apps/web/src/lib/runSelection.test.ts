import { describe, expect, it } from 'vitest';
import { areAllShownRunsSelected, setShownRunsSelected, toggleRunSelection } from './runSelection';

describe('Run の選択', () => {
  it('選んでいない Run のチェックで足し、選んだ Run のチェックで外す', () => {
    expect(toggleRunSelection(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleRunSelection(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('見出しのチェックで表示中の Run をまとめて選び、ほかのページで選んだ Run は残す', () => {
    expect(setShownRunsSelected(['other-page'], ['a', 'b'], true)).toEqual(['other-page', 'a', 'b']);
    expect(setShownRunsSelected(['a', 'other-page'], ['a', 'b'], true)).toEqual(['a', 'other-page', 'b']);
  });

  it('見出しのチェックを外すと表示中の Run だけを外す', () => {
    expect(setShownRunsSelected(['a', 'other-page', 'b'], ['a', 'b'], false)).toEqual(['other-page']);
  });

  it('表示中の Run がすべて選ばれているときだけ見出しのチェックが付く', () => {
    expect(areAllShownRunsSelected(['a', 'b', 'other-page'], ['a', 'b'])).toBe(true);
    expect(areAllShownRunsSelected(['a', 'other-page'], ['a', 'b'])).toBe(false);
  });
});
