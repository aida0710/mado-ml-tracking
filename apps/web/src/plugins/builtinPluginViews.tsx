import type { ComponentType } from 'react';
import type { PluginKind } from '@mmt/contracts';
import type { PluginSettingsProps } from './types';
import { MadoSettings } from './mado/MadoSettings';

interface BuiltinPluginView {
  kind: PluginKind;
  name: string;
  Settings: ComponentType<PluginSettingsProps>;
}

/** UIのコードはアプリに同梱する。サーバーの応答で選べるのは、この既知のビューだけ。 */
export const builtinPluginViews: readonly BuiltinPluginView[] = [
  { kind: 'mado', name: 'Mado', Settings: MadoSettings },
];
