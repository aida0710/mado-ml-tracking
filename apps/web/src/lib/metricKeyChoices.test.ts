import { describe, expect, it } from 'vitest';
import { describeMetricKeySource, suggestMetricKeys } from './metricKeyChoices';

const recorded = {
  items: ['evaluation.duration_match_rate', 'evaluation.wer', 'loss'],
  source: 'rule_runs' as const,
};

describe('合否基準の指標名の候補', () => {
  it('記録済みの指標名から、入力を含むものを大文字小文字を区別せずに出す', () => {
    expect(suggestMetricKeys('WER', recorded).items).toEqual(['evaluation.wer']);
    expect(suggestMetricKeys('', recorded).items).toEqual(recorded.items);
  });

  it('記録済みの名前なら注記を出さない', () => {
    expect(suggestMetricKeys('evaluation.wer', recorded).note).toBeUndefined();
  });

  it('記録されていない名前は、判定で不合格になると警告する', () => {
    const suggestions = suggestMetricKeys('evaluation.wre', recorded);
    expect(suggestions.noteTone).toBe('warning');
    expect(suggestions.note).toContain('「evaluation.wre」は評価Runに記録されていません');
  });

  it('候補の途中まで打っている間は、注記だけで警告にはしない', () => {
    const suggestions = suggestMetricKeys('wer', recorded);
    expect(suggestions.items).toEqual(['evaluation.wer']);
    expect(suggestions.note).toContain('「wer」は評価Runに記録されていません');
    expect(suggestions.noteTone).toBeUndefined();
  });

  it('まだ何も記録されていないときは、入力した名前を警告しない', () => {
    expect(suggestMetricKeys('wer', { items: [], source: 'none' }).note).toBeUndefined();
    expect(suggestMetricKeys('wer', undefined).note).toBeUndefined();
  });

  it('候補の出どころを基準の下で説明する', () => {
    expect(describeMetricKeySource(undefined)).toContain('評価ルールを選ぶと');
    expect(describeMetricKeySource(recorded)).toContain('この評価ルールの評価Run');
    expect(describeMetricKeySource({ items: ['wer'], source: 'code_version_runs' })).toContain(
      '同じ評価コードバージョン',
    );
    expect(describeMetricKeySource({ items: [], source: 'none' })).toContain('まだありません');
  });
});
