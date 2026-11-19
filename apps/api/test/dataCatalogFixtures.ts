import type { DataCatalogAccessTokenGrant } from '@mmt/contracts';
import type { DataCatalogClient } from '@mmt/platform';

export const DATA_CATALOG_URL_FIXTURE = 'https://catalog.example.test';
export const DATA_CATALOG_ACCESS_TOKEN_FIXTURE = 'fixture-data-catalog-access-token';

/** fixtureのtokenについてmado S3 Data Catalogが返す内容。容量を読める。 */
export const DATA_CATALOG_GRANT_FIXTURE: DataCatalogAccessTokenGrant = {
  name: 'ML Tracking',
  scopes: ['metrics:read'],
  expiresAt: null,
};

export function dataCatalogClientStub(overrides: Partial<DataCatalogClient> = {}): DataCatalogClient {
  return {
    accessTokenGrant: async () => DATA_CATALOG_GRANT_FIXTURE,
    capacityMetrics: async () => 'storage_bytes 12\n',
    ...overrides,
  };
}
