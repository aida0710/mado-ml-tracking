import { createMadoPlugin } from './mado/madoPlugin.js';

// Plugins and their UI are released with the application; no remote code or manifest is loaded.
export const builtinPlugins = { mado: { name: 'Mado', createClient: createMadoPlugin } } as const;
export type PluginClientFactory = typeof createMadoPlugin;
