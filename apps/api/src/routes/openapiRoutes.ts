import { Hono } from 'hono';
import {
  buildOpenApiDocument,
  type OpenApiDocument,
} from '../http/openapi/buildOpenApiDocument.js';
import { principal, type ApiEnvironment } from '../http/request.js';
import { requireScope } from '../services/accessService.js';

// /apiに置く。GET /openapi.jsonは、ログインしている誰にでもnative APIの文書を返す。
export function openapiRoutes(): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  // プロセスの実行中にカタログは変わらないので、文書は1回だけ作る。
  let document: OpenApiDocument | undefined;
  routes.get('/openapi.json', (context) => {
    requireScope(principal(context), 'read');
    document ??= buildOpenApiDocument();
    return context.json(document);
  });
  return routes;
}
