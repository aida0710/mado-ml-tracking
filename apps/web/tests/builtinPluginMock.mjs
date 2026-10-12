// Browser-only stand-in for the built-in Plugin API; production uses the authorized service.
export async function routeBuiltinPlugins({state, request, reply, id, now, project, user, datasetVersion, manifest}) {
  const {method, key, subresource, parts, body} = request;
  const list = (items) => reply({items});
  if (key === 'availability' && method === 'GET') {
    const connections = state.plugins.filter((plugin) => plugin.kind === 'mado');
    return list(connections.length ? connections.map((plugin) => ({
      kind: 'mado', id: plugin.id, enabled: plugin.enabled, configured: plugin.tokenConfigured && plugin.configurationStatus === 'ready',
      configRevision: plugin.configRevision, webUrl: plugin.config?.webUrl ?? null,
      canImport: project.role === 'admin' && plugin.enabled && plugin.tokenConfigured && plugin.configurationStatus === 'ready',
    })) : [{kind: 'mado', id: null, enabled: false, configured: false, configRevision: 0, webUrl: null, canImport: false}]);
  }
  if (project.role !== 'admin' && !user.isAdmin) return reply({error: 'Project admin required'}, 403);
  if (!key && method === 'GET') return list(state.plugins);
  if (!key && method === 'POST') {
    if (!user.isAdmin) return reply({error: 'Global admin required'}, 403);
    const credentialsConfigured = {readToken: Boolean(body.credentials?.readToken), lineageToken: Boolean(body.credentials?.lineageToken), metricsToken: Boolean(body.credentials?.metricsToken)};
    const plugin = {id: id(), projectId: project.id, name: body.name ?? 'Mado', kind: 'mado', config: body.config,
      configRevision: 1, configurationStatus: 'ready', credentialsConfigured,
      secretStorageAvailable: state.pluginSecretStorageAvailable ?? true,
      baseUrl: '', tokenEnv: '', tokenConfigured: credentialsConfigured.readToken && credentialsConfigured.lineageToken,
      enabled: body.enabled ?? false, manifest: null, createdAt: now};
    state.plugins.push(plugin);
    return reply(plugin, 201);
  }
  const plugin = state.plugins.find((connection) => connection.id === key);
  if (!plugin) return reply({error: 'Plugin not found'}, 404);
  if (method === 'PATCH' && !subresource) {
    if (!user.isAdmin) return reply({error: 'Global admin required'}, 403);
    if (body.expectedRevision !== undefined && body.expectedRevision !== plugin.configRevision) return reply({error: 'Configuration changed'}, 409);
    if (body.credentials) for (const name of ['readToken', 'lineageToken', 'metricsToken']) {
      if (name in body.credentials) plugin.credentialsConfigured[name] = Boolean(body.credentials[name]);
    }
    for (const name of ['name', 'config', 'enabled']) if (name in body) plugin[name] = body[name];
    plugin.tokenConfigured = plugin.credentialsConfigured.readToken && plugin.credentialsConfigured.lineageToken;
    plugin.configRevision++;
    if (body.config || body.credentials) plugin.manifest = null;
    return reply(plugin);
  }
  if (subresource === 'migration') {
    if (!user.isAdmin) return reply({error: 'Global admin required'}, 403);
    plugin.configurationStatus = 'ready';
    plugin.configRevision++;
    return reply(plugin);
  }
  if (subresource === 'check') {
    plugin.manifest = {...manifest, capabilities: ['datasets:search', 'lineage:publish', ...(plugin.credentialsConfigured.metricsToken ? ['storage:metrics'] : [])]};
    return reply(plugin.manifest);
  }
  if (subresource === 'metrics') {
    if (!plugin.credentialsConfigured.metricsToken) return reply({error: 'Unsupported capability'}, 422);
    if (state.metricsGate) await state.metricsGate;
    if (state.failPluginMetrics) return reply({error: 'UI verification: metrics unavailable'}, 502);
    return reply({prometheus: state.prometheus});
  }
  if (subresource === 'events') return reply({queued: 2});
  if (subresource === 'outbox') return reply({pending: 0, sending: 0, oldestPendingAt: null, maxAttempts: 0, lastError: null, lastDeliveredAt: null, stalled: false});
  const external = {externalId: '00000000-0000-4000-8000-000000000099', namespace: 'test', name: 'UI検索データ', version: 'v1', uri: 'file:///test/import', digest: 'import-digest', schema: {}, metadata: {}};
  if (subresource === 'datasets' && parts[3] === 'search') return list([external]);
  if (subresource === 'datasets' && parts[3] === 'import') {
    if (body.externalId !== external.externalId || body.expectedRevision !== plugin.configRevision) return reply({error: 'Version or configuration changed'}, 409);
    const imported = {...datasetVersion, ...external, id: id(), externalRef: {pluginId: plugin.id, externalId: external.externalId, namespace: external.namespace, name: external.name, version: external.version}};
    state.datasetVersions.push(imported);
    return reply(imported, 201);
  }
  return reply({error: 'Unhandled built-in Plugin operation'}, 501);
}
