import { describe, expect, it } from 'vitest';
import type { OperationsAlert } from '@mmt/contracts';
import { orderAlertsForProject } from './operationsAlertOrder';

function alert(id: string, projectId: string): OperationsAlert {
  return {
    id,
    projectId,
    kind: 'worker.offline',
    subjectId: `token:${id}`,
    openedAt: '2026-10-11T05:00:00Z',
    resolvedAt: null,
    resolution: null,
    detail: {},
  };
}

describe('ベルの運用アラートの並び', () => {
  it('開いているプロジェクトのアラートを先に、ほかは新しい順のまま後ろに並べる', () => {
    const alerts = [alert('a', 'other'), alert('b', 'open'), alert('c', 'other'), alert('d', 'open')];
    expect(orderAlertsForProject(alerts, 'open').map((item) => item.id)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
  });

  it('プロジェクトを開いていない全体設定では、APIの新しい順のまま並べる', () => {
    const alerts = [alert('a', 'one'), alert('b', 'two')];
    expect(orderAlertsForProject(alerts, undefined).map((item) => item.id)).toEqual(['a', 'b']);
  });
});
