import { describe, expect, it } from 'vitest';
import { filterCheckboxOptions } from './checkboxOptions';

const options = [
  { value: 'speech-v1', label: 'speech/jsut / v1' },
  { value: 'speech-v2', label: 'speech/jsut / v2' },
  { value: 'image-v1', label: 'vision/cifar / v1' },
];
const values = (items: { value: string }[]) => items.map((item) => item.value);

describe('チェックボックスの一覧の絞り込み', () => {
  it('入力した文字を含む選択肢だけを残す（大文字小文字は区別しない）', () => {
    expect(values(filterCheckboxOptions({ options, selected: [], query: 'JSUT' }))).toEqual([
      'speech-v1',
      'speech-v2',
    ]);
  });

  it('選んだものは絞り込みに合わなくても残し、何を選んだかが隠れない', () => {
    expect(
      values(filterCheckboxOptions({ options, selected: ['image-v1'], query: 'v2' })),
    ).toEqual(['speech-v2', 'image-v1']);
  });

  it('空の入力では全部を出す', () => {
    expect(values(filterCheckboxOptions({ options, selected: [], query: '  ' }))).toEqual(
      values(options),
    );
  });

  it('文字でない見出しの選択肢は searchText で探す', () => {
    expect(
      values(
        filterCheckboxOptions({
          options: [{ value: 'gpu-0', label: null, searchText: 'A100 80GB' }],
          selected: [],
          query: 'a100',
        }),
      ),
    ).toEqual(['gpu-0']);
  });
});
