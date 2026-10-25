import { Hono } from "hono";
import type { CurrentApiToken } from "@mmt/contracts";
import { DomainError } from "../domain/errors.js";
import { principal, type ApiEnvironment } from "../http/request.js";

// tokenを持つもの（`mado-tracking-worker doctor`など）が、tokenの一覧を見ずに自分のscopeを
// 確かめられるようにする。
export function currentTokenRoutes(): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.get("/", (context) => {
    const { token } = principal(context);
    if (!token)
      throw new DomainError({
        status: 400,
        code: "api_token_required",
        message: 'authenticate with an API token',
      });
    const current: CurrentApiToken = {
      id: token.id,
      projectId: token.projectId,
      scopes: token.scopes,
      job: token.job !== undefined,
    };
    return context.json(current);
  });
  return routes;
}
