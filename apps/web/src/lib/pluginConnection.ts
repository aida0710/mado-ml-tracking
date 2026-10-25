import type { PluginConnection } from '@mmt/contracts';

// 保存した設定と有効・無効の状態で、まだ操作してよい結果の範囲を区切る。
export function getPluginConnectionKey(
  plugin: Pick<PluginConnection, 'id' | 'projectId' | 'configRevision' | 'enabled'>,
): string {
  return JSON.stringify([plugin.projectId, plugin.id, plugin.configRevision, plugin.enabled]);
}
