import { z } from 'zod';
import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { DataCatalogConnectionInput } from '@mmt/contracts';
import { dataCatalogCapacityResponseSchema, dataCatalogPluginSchema } from '@mmt/contracts/schemas';

const DATA_CATALOG_PLUGIN_PATH = '/api/admin/plugins/data-catalog';

/** 全体管理 → Pluginsの、mado S3 Data Catalogへの接続。 */
export const dataCatalogPluginApi = {
  get: (signal?: AbortSignal) =>
    requestJson(DATA_CATALOG_PLUGIN_PATH, { schema: dataCatalogPluginSchema, init: { signal } }),
  /** 接続を確かめ、通ったら保存する。accessTokenを省くと保存済みのtokenで確かめ直す。 */
  connect: (body: DataCatalogConnectionInput) =>
    requestJson(DATA_CATALOG_PLUGIN_PATH, {
      schema: dataCatalogPluginSchema,
      init: jsonRequestInit('PUT', body),
    }),
  disconnect: () =>
    requestJson(DATA_CATALOG_PLUGIN_PATH, { schema: z.undefined(), init: { method: 'DELETE' } }),
  capacity: async (signal?: AbortSignal) =>
    (
      await requestJson(`${DATA_CATALOG_PLUGIN_PATH}/capacity`, {
        schema: dataCatalogCapacityResponseSchema,
        init: { signal },
      })
    ).prometheus,
};
