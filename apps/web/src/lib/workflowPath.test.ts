import { describe, expect, it } from 'vitest';
import { workflowPath } from './workflowPath';

describe('ワークフローの画面のアドレス', () => {
  it('実行を指定すると ?execution= でその実行を開き、指定しなければワークフローだけを開く', () => {
    expect(workflowPath('p1', { workflowId: 'w1', executionId: 'e1' })).toBe(
      '/projects/p1/workflows/w1?execution=e1',
    );
    expect(workflowPath('p1', { workflowId: 'w1' })).toBe('/projects/p1/workflows/w1');
    expect(workflowPath('p1', { workflowId: 'w1', executionId: null })).toBe(
      '/projects/p1/workflows/w1',
    );
  });
});
