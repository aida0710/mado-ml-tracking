import { createMadoPlugin } from './mado/madoPlugin.js';

// PluginとそのUIはアプリケーションと一緒にリリースする。外部のコードやmanifestは読み込まない。
export const builtinPlugins = { mado: { name: 'Mado', createClient: createMadoPlugin } } as const;
export type PluginClientFactory = typeof createMadoPlugin;
