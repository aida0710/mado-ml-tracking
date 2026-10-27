import type { Model, ModelAliasProtection, PromotionPolicy } from '@mmt/contracts';
import { describe, expect, it } from 'vitest';
import { collectKnownAliases, suggestAliasNames } from './aliasChoices';

const model = (id: string, aliases: Record<string, string>): Model => ({
  id,
  projectId: 'project',
  name: id,
  family: 'qwen3',
  description: '',
  latestVersion: null,
  aliases,
  createdAt: '2026-10-11T00:00:00Z',
});
const policy = (modelId: string, targetAlias: string, baselineAlias: string) =>
  ({ modelId, targetAlias, baselineAlias }) as PromotionPolicy;
const protection = (modelId: string | null, alias: string) =>
  ({ modelId, alias }) as ModelAliasProtection;

const sources = {
  models: [model('voice', { production: 'v1' }), model('asr', { staging: 'v2' })],
  policies: [policy('voice', 'champion', 'production'), policy('asr', 'asr-best', 'staging')],
  protections: [protection(null, 'release'), protection('asr', 'asr-only')],
};

describe('既存のAliasの候補', () => {
  it('モデルのAlias・そのモデルの昇格policy・保護aliasを集め、全モデル向けの保護も含める', () => {
    const known = collectKnownAliases({ ...sources, modelId: 'voice' });
    expect([...known]).toEqual([
      ['champion', ['policy']],
      ['production', ['model', 'policy']],
      ['release', ['protection']],
    ]);
  });

  it('全モデルを対象にするときは、どのモデルのAliasも候補にする', () => {
    const known = collectKnownAliases({ ...sources, modelId: null });
    expect([...known.keys()]).toEqual([
      'asr-best',
      'asr-only',
      'champion',
      'production',
      'release',
      'staging',
    ]);
  });

  it('入力を含むAliasを使われている場所つきで出し、既存の名前なら注記を出さない', () => {
    const known = collectKnownAliases({ ...sources, modelId: 'voice' });
    const suggestions = suggestAliasNames('PRO', known);
    expect(suggestions.items).toEqual(['production']);
    expect(suggestions.details).toEqual({ production: 'モデルで使用中・昇格ポリシー' });
    expect(suggestAliasNames('production', known).note).toBeUndefined();
  });

  it('打ち間違えた名前は、新しいAliasになることを注記する', () => {
    const known = collectKnownAliases({ ...sources, modelId: 'voice' });
    const suggestions = suggestAliasNames('producton', known);
    expect(suggestions.note).toBe('「producton」はまだ使われていない新しいAliasです。');
    expect(suggestions.noteTone).toBeUndefined();
  });

  it('大文字小文字だけが違うAliasは警告する', () => {
    const known = collectKnownAliases({ ...sources, modelId: 'voice' });
    const suggestions = suggestAliasNames('Production', known);
    expect(suggestions.noteTone).toBe('warning');
    expect(suggestions.note).toContain('「production」が既にあります');
  });
});
