import type { PluginConnection } from '@mmt/contracts';

// Saved configuration and enabled state delimit results that may still be acted on.
export function getPluginConnectionKey(
  plugin: Pick<PluginConnection, 'id' | 'projectId' | 'configRevision' | 'configurationStatus' | 'enabled'>,
): string {
  return JSON.stringify([plugin.projectId, plugin.id, plugin.configRevision, plugin.configurationStatus, plugin.enabled]);
}
