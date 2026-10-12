import type { ComponentType } from 'react';
import type { PluginAvailability } from '@mmt/contracts';
import type { DatasetPluginActionsProps, PluginSettingsProps } from './types';
import { MadoDatasetActions } from './mado/MadoDatasetActions';
import { MadoSettings } from './mado/MadoSettings';

interface BuiltinPluginView {
  kind: PluginAvailability['kind'];
  name: string;
  Settings: ComponentType<PluginSettingsProps>;
  DatasetActions: ComponentType<DatasetPluginActionsProps>;
}

/** UI code is bundled with the app. Server responses select only these known views. */
export const builtinPluginViews: readonly BuiltinPluginView[] = [
  { kind: 'mado', name: 'Mado', Settings: MadoSettings, DatasetActions: MadoDatasetActions },
];
