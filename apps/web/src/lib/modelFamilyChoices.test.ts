import type { ModelFamilySummary } from '@mmt/contracts';
import { describe, expect, it } from 'vitest';
import { findFamilyCaseVariants, suggestModelFamilies } from './modelFamilyChoices';

const families: ModelFamilySummary[] = [
  { name: 'linear', modelCount: 2, codeVersionCount: 1 },
  { name: 'qwen3', modelCount: 3, codeVersionCount: 2 },
  { name: 'qwen3-omni', modelCount: 0, codeVersionCount: 1 },
];

describe('モデル系列の候補', () => {
  it('入力を含む既存の系列を、大文字小文字を区別せずに使われている件数つきで出す', () => {
    const suggestions = suggestModelFamilies('QWEN', families);
    expect(suggestions.items).toEqual(['qwen3', 'qwen3-omni']);
    expect(suggestions.details).toEqual({
      qwen3: 'モデル3件・コード2件',
      'qwen3-omni': 'モデル0件・コード1件',
    });
  });

  it('空欄では全部の系列を出し、注記は出さない', () => {
    const suggestions = suggestModelFamilies('', families);
    expect(suggestions.items).toEqual(['linear', 'qwen3', 'qwen3-omni']);
    expect(suggestions.note).toBeUndefined();
  });

  it('既存の系列と同じなら注記を出さない', () => {
    expect(suggestModelFamilies('qwen3', families).note).toBeUndefined();
  });

  it('大文字小文字だけが違う系列を作ろうとすると警告する', () => {
    const suggestions = suggestModelFamilies('Qwen3', families);
    expect(suggestions.noteTone).toBe('warning');
    expect(suggestions.note).toContain('「qwen3」が既にあります');
  });

  it('どれとも違う系列は、新しい系列として登録すると伝える（警告ではない）', () => {
    const suggestions = suggestModelFamilies(' gemma2 ', families);
    expect(suggestions.note).toBe('新しい系列「gemma2」として登録します。');
    expect(suggestions.noteTone).toBeUndefined();
  });

  it('大文字小文字だけが違う系列を、同じ綴りの系列を除いて探す', () => {
    expect(findFamilyCaseVariants('QWEN3', ['qwen3', 'Qwen3', 'QWEN3', 'linear'])).toEqual([
      'qwen3',
      'Qwen3',
    ]);
  });
});
