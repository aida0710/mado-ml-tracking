import pg from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';

export type Database = pg.Pool;
export type Connection = Database | PoolClient;

// Web APIとoutboxの余地を残しつつ、開発用DBへの接続数を抑える。
const DATABASE_POOL_SIZE = 12;
// PostgreSQLが使えないときは、すぐに目に見える失敗を返す。
const DATABASE_CONNECTION_TIMEOUT_MS = 5000;
// 使っていないAPIの接続は、DBのpoolを占め続けずに解放する。
const DATABASE_IDLE_TIMEOUT_MS = 30000;

export function createDatabase(databaseUrl: string): Database {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: DATABASE_POOL_SIZE,
    connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: DATABASE_IDLE_TIMEOUT_MS,
  });
}

export async function transaction<T>(
  database: Database,
  operation: (connection: PoolClient) => Promise<T>,
): Promise<T> {
  const connection = await database.connect();
  try {
    await connection.query('BEGIN');
    const value = await operation(connection);
    await connection.query('COMMIT');
    return value;
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
}

function mapColumns<T>(row: QueryResultRow): T {
  const entity: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    const property = column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    // JSONの値は元のキーのまま。名前を変換するのはSQLの列だけ。bigintの列は文字列で届く。
    // NULLのもの（参照型のDatasetVersionのtotal_size）はnullのまま。
    entity[property] =
      value instanceof Date
        ? value.toISOString()
        : ['size', 'run_count', 'total_size', 'dataset_cache_max_bytes'].includes(column) &&
            value !== null
          ? Number(value)
          : value;
  }
  return entity as T;
}

export async function rows<T>(
  connection: Connection,
  sql: string,
  parameters: readonly unknown[] = [],
): Promise<T[]> {
  const response = await connection.query(sql, [...parameters]);
  return response.rows.map((row) => mapColumns<T>(row));
}

export async function first<T>(
  connection: Connection,
  sql: string,
  parameters: readonly unknown[] = [],
): Promise<T | undefined> {
  return (await rows<T>(connection, sql, parameters))[0];
}
