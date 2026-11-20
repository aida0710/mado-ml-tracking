import type { DataCatalogAccessTokenGrant, DataCatalogStorageConnection } from '@mmt/contracts';
import { first, type Connection } from '../db/database.js';

/** 保存するフィールド。暗号文を応答に載せないよう、応答はサービスが明示的に組み立てる。 */
export interface DataCatalogConnectionRow {
  url: string;
  secretKeyId: string;
  encryptedAccessToken: Buffer;
  accessTokenGrant: DataCatalogAccessTokenGrant;
  storageConnections: DataCatalogStorageConnection[];
  checkedAt: string;
}

export function findDataCatalogConnection(
  connection: Connection,
): Promise<DataCatalogConnectionRow | undefined> {
  return first<DataCatalogConnectionRow>(connection, 'SELECT * FROM data_catalog_connection');
}

/** 全体で1つの接続を、確かめたばかりの内容で置き換える。 */
export async function saveDataCatalogConnection(
  connection: Connection,
  checked: Omit<DataCatalogConnectionRow, 'checkedAt'>,
): Promise<DataCatalogConnectionRow> {
  return (await first<DataCatalogConnectionRow>(
    connection,
    `INSERT INTO data_catalog_connection(url,secret_key_id,encrypted_access_token,access_token_grant,storage_connections,checked_at)
     VALUES($1,$2,$3,$4::jsonb,$5::jsonb,now())
     ON CONFLICT (singleton) DO UPDATE SET url=EXCLUDED.url,secret_key_id=EXCLUDED.secret_key_id,
       encrypted_access_token=EXCLUDED.encrypted_access_token,
       access_token_grant=EXCLUDED.access_token_grant,
       storage_connections=EXCLUDED.storage_connections,checked_at=EXCLUDED.checked_at
     RETURNING *`,
    [
      checked.url,
      checked.secretKeyId,
      checked.encryptedAccessToken,
      JSON.stringify(checked.accessTokenGrant),
      JSON.stringify(checked.storageConnections),
    ],
  ))!;
}

export async function deleteDataCatalogConnection(
  connection: Connection,
): Promise<DataCatalogConnectionRow | undefined> {
  return first<DataCatalogConnectionRow>(
    connection,
    'DELETE FROM data_catalog_connection RETURNING *',
  );
}

/** 読み直したストレージ接続の一覧で置き換える。接続を確かめた日時は変えない。 */
export async function replaceDataCatalogStorageConnections(
  connection: Connection,
  storageConnections: DataCatalogStorageConnection[],
): Promise<void> {
  await connection.query('UPDATE data_catalog_connection SET storage_connections=$1::jsonb', [
    JSON.stringify(storageConnections),
  ]);
}
