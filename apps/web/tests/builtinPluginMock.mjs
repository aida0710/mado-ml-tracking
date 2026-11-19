// 組み込みのPlugin APIのブラウザ専用の代役。本番では認可されたサービスを使う。
export async function routeBuiltinPlugins({state, request, reply, id, now, project, user, manifest}) {
  const {method, key, subresource, body} = request;
  const list = (items) => reply({items});
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
    plugin.manifest = {...manifest, capabilities: grant.scopes.includes('metrics:read') ? ['storage:metrics'] : []};
    return reply(plugin);
  }
  if (subresource === 'metrics') {
    if (!plugin.accessTokenGrant?.scopes.includes('metrics:read')) return reply({error: 'Unsupported capability'}, 422);
    if (state.metricsGate) await state.metricsGate;
    if (state.failPluginMetrics) return reply({error: 'UI verification: metrics unavailable'}, 502);
    return reply({prometheus: state.prometheus});
  }
  return reply({error: 'Unhandled built-in Plugin operation'}, 501);
}
