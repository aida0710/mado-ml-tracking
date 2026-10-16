import { describe, expect, it } from 'vitest';
import type { PluginConnection } from '@mmt/contracts';
import {
  getPluginConnectionsWithSavedResponses,
  getUnobservedPluginResponses,
} from './pluginConnectionResponses';

function connection(id: string, configRevision: number, projectId = 'project'): PluginConnection {
  return {
    id, projectId, name: id, configRevision, enabled: true,
  } as PluginConnection;
}

describe('保存済み連携と一覧の照合', () => {
  it('遅い一覧取得の間に複数接続を保存しても全接続の新しい状態を保持する', () => {
    const first = { ...connection('first', 2), enabled: false };
    const second = { ...connection('second', 2), enabled: false };
    expect(
      getPluginConnectionsWithSavedResponses({
        projectId: 'project',
        observedConnections: [connection('first', 1), connection('second', 1)],
        savedResponses: new Map([['first', first], ['second', second]]),
      }),
    ).toEqual([first, second]);
  });

  it('一覧で取得したより新しいrevisionを古い保存応答で戻さない', () => {
    const newer = { ...connection('first', 3), name: 'newer', enabled: false };
    expect(
      getPluginConnectionsWithSavedResponses({
        projectId: 'project',
        observedConnections: [newer],
        savedResponses: new Map([['first', connection('first', 2)]]),
      }),
    ).toEqual([newer]);
  });

  it('取得済みの接続だけを破棄し未取得と別Projectの保存応答を保持する', () => {
    const unseen = connection('unseen', 2);
    const elsewhere = connection('elsewhere', 2, 'other-project');
    expect(
      getUnobservedPluginResponses({
        savedResponses: new Map([
          ['observed', connection('observed', 2)],
          ['unseen', unseen],
          ['elsewhere', elsewhere],
        ]),
        observedConnections: [connection('observed', 3), connection('unseen', 1)],
      }),
    ).toEqual(new Map([['unseen', unseen], ['elsewhere', elsewhere]]));
  });

  it('Projectを切り替えると別Projectの保存済み接続を表示しない', () => {
    expect(
      getPluginConnectionsWithSavedResponses({
        projectId: 'other-project',
        observedConnections: [],
        savedResponses: new Map([['first', connection('first', 2)]]),
      }),
    ).toEqual([]);
  });
});
