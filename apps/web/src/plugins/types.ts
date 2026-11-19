import type { PluginConnection } from '@mmt/contracts';

export interface PluginSettingsProps {
  plugin: PluginConnection | null;
  onSaved: (plugin: PluginConnection) => void;
}
