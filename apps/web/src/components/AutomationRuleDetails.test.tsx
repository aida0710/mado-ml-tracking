import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { ModelAutomationRule } from '@mmt/contracts';
import { AutomationRuleDetails } from './AutomationRuleDetails';
import { computeTarget, executionCatalog } from '../../tests/fixtures/execution';
import { automationText } from '../i18n/automation';

const inferRule: ModelAutomationRule = {
  id: 'infer-rule',
  projectId: 'project',
  name: '登録時に推論',
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
  createdByName: '研究者',
  runAsUserId: 'admin',
  createdAt: '2026-10-08T00:00:00Z',
};
const evaluateRule: ModelAutomationRule = {
  ...inferRule,
  id: 'evaluate-rule',
  name: '推論のあとに評価',
  trigger: 'upstream_run_finished',
  upstreamRuleId: 'infer-rule',
  kind: 'evaluation',
};
const rules = [inferRule, evaluateRule];

function render(rule: ModelAutomationRule, { canManage }: { canManage: boolean }) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AutomationRuleDetails
        rule={rule}
        rules={rules}
        catalog={{ registry: executionCatalog, targets: [computeTarget], rules }}
        projectId="project"
        canManage={canManage}
        pending={false}
        onSelectRule={() => undefined}
        onEnable={() => undefined}
        onCopy={() => undefined}
        onShowHistory={() => undefined}
        onApplied={() => undefined}
      />
    </MemoryRouter>,
  );
}

describe('自動実行ルールの詳細', () => {
  it('無効なルールには適用の欄を出さず、有効にすると適用できることと［有効にする］を出す', () => {
    const html = render({ ...inferRule, enabled: false }, { canManage: true });
    expect(html).toContain(automationText.disabledRuleCannotApply);
    expect(html).toContain(`>${automationText.enableRule}</button>`);
    expect(html).not.toContain(`${automationText.applyToVersion}</button>`);
  });

  it('有効なルールには適用の欄を出し、有効にする案内は出さない', () => {
    const html = render(inferRule, { canManage: true });
    expect(html).toContain(`${automationText.applyToVersion}</button>`);
    expect(html).not.toContain(automationText.disabledRuleCannotApply);
  });

  it('このルールの後に動くルールと、絞り込んだ実行履歴への入口を出す', () => {
    const html = render(inferRule, { canManage: false });
    expect(html).toContain(automationText.downstreamRules);
    expect(html).toContain('>推論のあとに評価</button>');
    expect(html).toContain(`>${automationText.showRuleHistory}</button>`);
  });

  it('複製して作るのはルールを管理できる人だけ', () => {
    expect(render(inferRule, { canManage: true })).toContain(automationText.copyRule);
    expect(render(inferRule, { canManage: false })).not.toContain(automationText.copyRule);
  });
});
