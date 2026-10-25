// 組み込みのPlugin APIのブラウザ専用の代役。本番では認可されたサービスを使う。
export async function routeBuiltinPlugins({state, request, reply, id, now, project, user, datasetVersion, manifest}) {
  const {method, key, subresource, parts, body} = request;
  const list = (items) => reply({items});
  if (key === 'availability' && method === 'GET') {
    const connections = state.plugins.filter((plugin) => plugin.kind === 'mado');
    return list(connections.length ? connections.map((plugin) => ({
      kind: 'mado', id: plugin.id, enabled: plugin.enabled, configured: plugin.tokenConfigured,
      configRevision: plugin.configRevision, webUrl: plugin.config?.webUrl ?? null,
      canImport: project.role === 'admin' && plugin.enabled && plugin.tokenConfigured,
    })) : [{kind: 'mado', id: null, enabled: false, configured: false, configRevision: 0, webUrl: null, canImport: false}]);
  }
  if (project.role !== 'admin' && !user.isAdmin) return reply({error: 'Project admin required'}, 403);
  if (!key && method === 'GET') return list(state.plugins);
  if (!key && method === 'POST') {
    if (!user.isAdmin) return reply({error: 'Global admin required'}, 403);
    const credentialsConfigured = {accessToken: Boolean(body.credentials?.accessToken)};
    const plugin = {id: id(), projectId: project.id, name: body.name ?? 'Mado', kind: 'mado', config: body.config,
      configRevision: 1, credentialsConfigured,
      secretStorageAvailable: state.pluginSecretStorageAvailable ?? true,
      tokenConfigured: credentialsConfigured.accessToken,
      enabled: body.enabled ?? false, manifest: null, accessTokenGrant: null, createdAt: now};
    state.plugins.push(plugin);
    return reply(plugin, 201);
  }
  const plugin = state.plugins.find((connection) => connection.id === key);
  if (!plugin) return reply({error: 'Plugin not found'}, 404);
  if (method === 'PATCH' && !subresource) {
    if (!user.isAdmin) return reply({error: 'Global admin required'}, 403);
    if (body.expectedRevision !== undefined && body.expectedRevision !== plugin.configRevision) return reply({error: 'Configuration changed'}, 409);
    if (body.credentials?.accessToken) plugin.credentialsConfigured.accessToken = true;
    for (const name of ['name', 'config', 'enabled']) if (name in body) plugin[name] = body[name];
    plugin.tokenConfigured = plugin.credentialsConfigured.accessToken;
    plugin.configRevision++;
    if (body.config || body.credentials?.accessToken) Object.assign(plugin, {manifest: null, accessTokenGrant: null});
    return reply(plugin);
  }
  if (subresource === 'check') {
    // 保存済みのtokenについて、フィクスチャのmado S3 Data Catalogが返す答え。テストは
    // state.madoAccessTokenGrantを変えて答えを変える。
    const grant = state.madoAccessTokenGrant;
    plugin.accessTokenGrant = grant;
    plugin.manifest = {...manifest, capabilities: ['datasets:search', 'lineage:publish', ...(grant.scopes.includes('metrics:read') ? ['storage:metrics'] : [])]};
    return reply(plugin);
  }
  if (subresource === 'metrics') {
    if (!plugin.accessTokenGrant?.scopes.includes('metrics:read')) return reply({error: 'Unsupported capability'}, 422);
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
