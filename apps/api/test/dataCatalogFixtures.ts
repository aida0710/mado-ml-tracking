import type { DataCatalogAccessTokenGrant, DataCatalogStorageConnection } from '@mmt/contracts';
import type { DataCatalogClient } from '@mmt/platform';

export const DATA_CATALOG_URL_FIXTURE = 'https://catalog.example.test';
export const DATA_CATALOG_ACCESS_TOKEN_FIXTURE = 'fixture-data-catalog-access-token';

/** fixtureのtokenについてmado S3 Data Catalogが返す内容。容量を読める。 */
export const DATA_CATALOG_GRANT_FIXTURE: DataCatalogAccessTokenGrant = {
  name: 'ML Tracking',
  scopes: ['metrics:read'],
  expiresAt: null,
};

/** fixtureのtokenに許可されたストレージ接続。 */
export const ON_PREMISES_STORAGE_CONNECTION_FIXTURE: DataCatalogStorageConnection = {
  id: 'onprem01',
  name: 'on-premises',
  provider: 'onprem',
};
export const DATA_CATALOG_STORAGE_CONNECTIONS_FIXTURE: DataCatalogStorageConnection[] = [
  ON_PREMISES_STORAGE_CONNECTION_FIXTURE,
  { id: 'aws01', name: 'AWS', provider: 'aws' },
];

export function dataCatalogClientStub(overrides: Partial<DataCatalogClient> = {}): DataCatalogClient {
  return {
    accessTokenGrant: async () => DATA_CATALOG_GRANT_FIXTURE,
    storageConnections: async () => DATA_CATALOG_STORAGE_CONNECTIONS_FIXTURE,
    capacityMetrics: async () => 'storage_bytes 12\n',
    ...overrides,
  };
}
