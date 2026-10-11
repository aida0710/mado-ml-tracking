// The Plugins screen: what a plugin is for, whether the API server can reach it, and where its
// imports go. The older plugin labels (Check connection, Search datasets, ...) stay in catalog.ts.
export const pluginsText = {
  pluginsAbout:
    "A plugin is a service that runs separately from this application. Registering the Mado plugin lets you search Mado datasets, import them as run inputs, and send run records to Mado.",
  pluginsEmptyForProjectAdmin:
    "No plugins are registered for this project. Global administrators register plugins. To use Mado datasets as run inputs, ask a global administrator to register the Mado plugin.",
  pluginsEmptyForGlobalAdmin:
    "No plugins are registered for this project. Register one with “Register plugin”. Plugins are registered per project.",
  pluginTokenStatus: "API server setting",
  pluginTokenConfigured: "Configured",
  pluginTokenMissing: "Not configured (variable missing on the API server)",
  pluginSearchNeedsCheck: "You can search datasets after “Check connection” succeeds.",
  pluginOpenDatasets: "View imported datasets",
  madoPluginPresetHint:
    "The connection URL is the URL the Mado plugin listens on (http://127.0.0.1:4190 on the same machine). The environment variable is the one in the API server's .env that holds the same value as the plugin's MMT_PLUGIN_TOKEN.",
} as const;

export const pluginsTextTemplates = {
  pluginTokenMissingNotice: (name: string) =>
    `The API server does not have the environment variable ${name}. Set ${name} in the API server's .env to the same value as the plugin's MMT_PLUGIN_TOKEN, restart the API server, and then press “Check connection”.`,
};
