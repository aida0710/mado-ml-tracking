import { describe, expect, it } from 'vitest';
import { suggestRunFilter } from './runFilterSuggestion';

describe('metrics. を付け忘れた検索の提案', () => {
  it('数値と比べていれば metrics の比較を提案する（名前に . を含んでもよい）', () => {
    expect(suggestRunFilter('loss < 0.2')).toBe('metrics.loss < 0.2');
    expect(suggestRunFilter('train.loss<=1e-3')).toBe('metrics.train.loss <= 1e-3');
  });

  it('文字列と等しいかを見ていれば params の比較を、引用符を付けて提案する', () => {
    expect(suggestRunFilter('optimizer = adamw')).toBe("params.optimizer = 'adamw'");
    expect(suggestRunFilter("optimizer != 'sgd'")).toBe("params.optimizer != 'sgd'");
  });

  it('ただの名前、正しい検索式、大小で比べた文字列には提案しない', () => {
    expect(suggestRunFilter('whisper-small')).toBeNull();
    expect(suggestRunFilter('metrics.loss < 0.2')).toBeNull();
    expect(suggestRunFilter('optimizer > adamw')).toBeNull();
    expect(suggestRunFilter('')).toBeNull();
  });
});
