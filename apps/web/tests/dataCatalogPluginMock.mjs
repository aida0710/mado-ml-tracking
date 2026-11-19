// 全体管理 → Pluginsの、mado S3 Data Catalogへの接続のAPI（/api/admin/plugins/data-catalog）の
// ブラウザ専用の代役。
const DATA_CATALOG_PLUGIN_PATH = '/admin/plugins/data-catalog';

/** テストが`state.dataCatalog`として持ち、書き換えて相手の応答を変える。 */
export function createDataCatalogState() {
  return {
    /** 保存済みの接続。未接続ならnull。 */
    connection: null,
    secretStorageAvailable: true,
    /** フィクスチャのmado S3 Data Catalogが、アクセストークンについて返す内容。 */
    accessTokenGrant: { name: 'ML Tracking', scopes: ['metrics:read'], expiresAt: null },
    /** 入っていれば、接続の確認をこの{status,code,error}で失敗させる。 */
    connectFailure: null,
    failCapacity: false,
    capacityGate: null,
  };
}

/** この経路でなければundefinedを返し、呼び出し側がほかの経路を探す。 */
export function routeDataCatalogPlugin({ state, request, reply, user, now }) {
  const { path, method, body } = request;
  if (!path.startsWith(DATA_CATALOG_PLUGIN_PATH)) return undefined;
  const dataCatalog = state.dataCatalog;
  if (!user.isAdmin)
    return reply({ error: 'administrator permission required', code: 'admin_required' }, 403);
  const plugin = () => ({
    connection: dataCatalog.connection,
    secretStorageAvailable: dataCatalog.secretStorageAvailable,
  });
  if (path === `${DATA_CATALOG_PLUGIN_PATH}/capacity`) return replyCapacity({ state, reply });
  if (method === 'GET') return reply(plugin());
  if (method === 'DELETE') {
    dataCatalog.connection = null;
    return reply(undefined, 204);
  }
  if (method !== 'PUT') return reply({ error: 'Unhandled mado S3 Data Catalog operation' }, 501);
  const saved = dataCatalog.connection;
  if (!body.accessToken && saved?.url !== body.url)
    return reply(
      {
        error: 'enter the access token of this mado S3 Data Catalog',
        code: 'data_catalog_access_token_required',
      },
      422,
    );
  if (dataCatalog.connectFailure) {
    const { status, ...failure } = dataCatalog.connectFailure;
    return reply(failure, status);
  }
  dataCatalog.connection = {
    url: body.url,
    accessTokenGrant: dataCatalog.accessTokenGrant,
    checkedAt: now(),
  };
  return reply(plugin());
}

async function replyCapacity({ state, reply }) {
  const dataCatalog = state.dataCatalog;
  if (!dataCatalog.connection)
    return reply({ error: 'mado S3 Data Catalog connection not found', code: 'not_found' }, 404);
  if (!dataCatalog.connection.accessTokenGrant.scopes.includes('metrics:read'))
    return reply(
      { error: 'the access token does not allow reading capacity', code: 'data_catalog_capacity_not_permitted' },
      422,
    );
  if (dataCatalog.capacityGate) await dataCatalog.capacityGate;
  if (dataCatalog.failCapacity)
    return reply({ error: 'UI verification: capacity unavailable', code: 'data_catalog_request_failed' }, 502);
  return reply({ prometheus: state.prometheus });
}
