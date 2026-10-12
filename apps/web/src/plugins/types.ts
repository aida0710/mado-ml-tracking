import type { DatasetVersion, PluginAvailability, PluginConnection } from '@mmt/contracts';

export interface PluginSettingsProps {
  plugin: PluginConnection | null;
  onSaved: (plugin: PluginConnection) => void;
}

export interface DatasetPluginActionsProps {
  projectId: string;
  availability: PluginAvailability;
  version?: DatasetVersion;
}
