import { Hono } from 'hono';
import type { Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import type { ApiEnvironment } from '../http/request.js';

/** `GET /healthz` の成功時の本文。mado S3 Data Catalog と同じ形。 */
export const HEALTHY_BODY = { status: 'ok' } as const;

/**
 * コンテナのヘルスチェックと、worker・SDK の到達確認が叩く `GET /healthz`。/api の外に置き、認証は
 * 通さない。プロセスが応答できても DB に届かなければ仕事ができないので、DB への問い合わせまで確かめる。
 */
export function healthRoutes(database: Database): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/healthz', async (context) => {
    try {
      await database.query('SELECT 1');
    } catch {
      throw new DomainError({
        status: 503,
        code: 'database_unavailable',
        message: 'database is unavailable',
      });
    }
    return context.json(HEALTHY_BODY);
  });
  return routes;
}
