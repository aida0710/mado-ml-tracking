import { describe, expect, it } from 'vitest';
import type { ModelAutomationRule } from '@mmt/contracts';
import { computeTarget, executionCatalog } from '../../tests/fixtures/execution';
import {
  buildAutomationRuleInput,
  createAutomationValues,
  createAutomationValuesFromRule,
  downstreamRules,
  updateAutomationValues,
  upstreamRuleCandidates,
} from './modelAutomationInput';
import { canManageAutomationRules } from './automationPermissions';

const inferenceRule: ModelAutomationRule = {
  id: 'infer-rule',
  projectId: 'project',
  name: 'Infer',
  enabled: true,
  trigger: 'model_registered',
  upstreamRuleId: null,
  modelFamilies: ['Qwen3'],
  kind: 'inference',
  experimentId: 'experiment',
  codeVersionId: 'code-v1',
  targetId: 'target',
  gpuIds: [],
  inputDatasetVersionIds: [],
  parameters: {},
  tags: {},
  maxAttempts: 1,
  summaryMetrics: [],
  createdBy: 'admin',
  runAsUserId: 'admin',
  createdAt: '2026-10-08T00:00:00Z',
};
const disabledRule = { ...inferenceRule, id: 'disabled-rule', enabled: false };
const catalog = {
  registry: executionCatalog,
  targets: [computeTarget],
  rules: [inferenceRule, disabledRule],
};
const values = {
  ...createAutomationValues(['Qwen3']),
  name: 'Evaluate new models',
  experimentId: 'experiment',
  codeVersionId: 'code-v1',
  targetId: 'target',
  gpuIds: ['0'],
  inputDatasetVersionIds: ['dataset-v1'],
  parameters: '{"temperature":0}',
  tags: '{"suite":"test"}',
};
describe('モデル自動実行ルールの入力', () => {
  it('実験・コードバージョン・データセットバージョン・Targetを固定して登録する', () => {
    expect(buildAutomationRuleInput(values, catalog)).toMatchObject({
      experimentId: 'experiment',
      codeVersionId: 'code-v1',
      targetId: 'target',
      inputDatasetVersionIds: ['dataset-v1'],
      parameters: { temperature: 0 },
      tags: { suite: 'test' },
    });
  });
  it('未対応のモデル系列と学習種別を拒否する', () => {
    expect(() =>
      buildAutomationRuleInput({ ...values, modelFamilies: ['Qwen2'] }, catalog),
    ).toThrow();
    expect(() => buildAutomationRuleInput({ ...values, kind: 'training' }, catalog)).toThrow();
  });
  it('Runtime非対応のTargetと別ProjectのDatasetを拒否する', () => {
    expect(() =>
      buildAutomationRuleInput(values, {
        ...catalog,
        targets: [{ ...computeTarget, runtimeKinds: ['python'] }],
      }),
    ).toThrow();
    expect(() =>
      buildAutomationRuleInput({ ...values, inputDatasetVersionIds: ['foreign-dataset'] }, catalog),
    ).toThrow();
  });
  it('モデル登録トリガーでは上流ruleを送らない', () => {
    expect(buildAutomationRuleInput(values, catalog)).toMatchObject({
      trigger: 'model_registered',
      upstreamRuleId: null,
    });
  });
  it('上流ruleの成功トリガーは上流ruleが必須で、有効なruleだけを上流にできる', () => {
    const chained = { ...values, trigger: 'upstream_run_finished', kind: 'evaluation' };
    expect(() => buildAutomationRuleInput(chained, catalog)).toThrow('上流ruleを選択');
    expect(() =>
      buildAutomationRuleInput({ ...chained, upstreamRuleId: 'disabled-rule' }, catalog),
    ).toThrow('有効な別のrule');
    expect(() =>
      buildAutomationRuleInput({ ...chained, upstreamRuleId: 'other-project-rule' }, catalog),
    ).toThrow('有効な別のrule');
    expect(
      buildAutomationRuleInput({ ...chained, upstreamRuleId: 'infer-rule' }, catalog),
    ).toMatchObject({ trigger: 'upstream_run_finished', upstreamRuleId: 'infer-rule' });
  });
  it('ruleは自分自身を上流に選べない', () => {
    expect(
      upstreamRuleCandidates(catalog.rules, 'infer-rule').map((rule) => rule.id),
    ).toEqual([]);
    expect(upstreamRuleCandidates(catalog.rules).map((rule) => rule.id)).toEqual(['infer-rule']);
  });
  it.each(['automation.ruleId', 'mmt.sweepId'])('予約tag %s を付けたruleを拒否する', (key) => {
    expect(() =>
      buildAutomationRuleInput({ ...values, tags: JSON.stringify({ [key]: 'x' }) }, catalog),
    ).toThrow(key);
  });
  it('予約prefixで始まらないtagは通す', () => {
    expect(
      buildAutomationRuleInput({ ...values, tags: '{"automation":"x","team.mmt":"y"}' }, catalog)
        .tags,
    ).toEqual({ automation: 'x', 'team.mmt': 'y' });
  });
  it('トリガーをモデル登録へ戻すと上流ruleの選択を外す', () => {
    expect(
      updateAutomationValues({
        previous: { ...values, trigger: 'upstream_run_finished', upstreamRuleId: 'infer-rule' },
        next: { ...values, trigger: 'model_registered', upstreamRuleId: 'infer-rule' },
        catalog,
      }).upstreamRuleId,
    ).toBe('');
  });
  it('対象モデル系列が空なら上流ruleの系列を引き継ぐ', () => {
    expect(
      updateAutomationValues({
        previous: { ...values, modelFamilies: [], trigger: 'upstream_run_finished' },
        next: {
          ...values,
          modelFamilies: [],
          trigger: 'upstream_run_finished',
          upstreamRuleId: 'infer-rule',
        },
        catalog,
      }).modelFamilies,
    ).toEqual(['Qwen3']);
  });
  it('最大試行回数がAPIの上限を超えると拒否する', () => {
    expect(() => buildAutomationRuleInput({ ...values, maxAttempts: '101' }, catalog)).toThrow();
  });
  it('Targetやコードバージョンを変えると古いGPU選択を残さない', () => {
    expect(
      updateAutomationValues({
        previous: values,
        next: { ...values, targetId: 'another-target' },
        catalog,
      }).gpuIds,
    ).toEqual([]);
    expect(
      updateAutomationValues({
        previous: values,
        next: { ...values, modelFamilies: ['Qwen2'] },
        catalog,
      }),
    ).toMatchObject({ codeVersionId: '', targetId: '', gpuIds: [] });
  });
  it.each(['viewer', 'editor'] as const)('%sは閲覧だけでglobal adminなら変更できる', (role) => {
    expect(canManageAutomationRules(role, false)).toBe(false);
    expect(canManageAutomationRules(role, true)).toBe(true);
  });
  it('Project adminはglobal adminでなくてもルールを変更できる', () => {
    expect(canManageAutomationRules('admin', false)).toBe(true);
  });
  it('ルールを複製すると、名前以外の設定をそのまま引き継いだ新しいルールとして登録できる', () => {
    const source: ModelAutomationRule = {
      ...inferenceRule,
      id: 'evaluate-rule',
      name: 'Evaluate',
      trigger: 'upstream_run_finished',
      upstreamRuleId: 'infer-rule',
      kind: 'inference',
      gpuIds: ['0'],
      inputDatasetVersionIds: ['dataset-v1'],
      parameters: { temperature: 0 },
      tags: { suite: 'test' },
      maxAttempts: 3,
      enabled: false,
    };
    const copied = createAutomationValuesFromRule(source);
    expect(copied.name).toBe('Evaluate（複製）');
    expect(copied.enabled).toBe('true');
    const { name, enabled, ...settings } = buildAutomationRuleInput(copied, catalog);
    expect({ name, enabled }).toEqual({ name: 'Evaluate（複製）', enabled: true });
    expect(settings).toEqual({
      trigger: 'upstream_run_finished',
      upstreamRuleId: 'infer-rule',
      modelFamilies: ['Qwen3'],
      kind: 'inference',
      experimentId: 'experiment',
      codeVersionId: 'code-v1',
      targetId: 'target',
      gpuIds: ['0'],
      inputDatasetVersionIds: ['dataset-v1'],
      parameters: { temperature: 0 },
      tags: { suite: 'test' },
      maxAttempts: 3,
    });
  });
  it('このルールを上流にしているルールだけを、後に動くルールとして挙げる', () => {
    const follower = { ...inferenceRule, id: 'follower', upstreamRuleId: 'infer-rule' };
    expect(
      downstreamRules([inferenceRule, disabledRule, follower], inferenceRule).map((rule) => rule.id),
    ).toEqual(['follower']);
  });
  it('上流に推論のルールを選ぶと、実行種別を評価にしておく。自分で選んだ種別は変えない', () => {
    const chained = { ...values, trigger: 'upstream_run_finished' };
    expect(
      updateAutomationValues({
        previous: chained,
        next: { ...chained, upstreamRuleId: 'infer-rule' },
        catalog,
      }).kind,
    ).toBe('evaluation');
    expect(
      updateAutomationValues({
        previous: chained,
        next: { ...chained, upstreamRuleId: 'infer-rule', kind: 'processing' },
        catalog,
      }).kind,
    ).toBe('processing');
  });
});
