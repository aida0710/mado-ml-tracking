import { getConnInfo } from '@hono/node-server/conninfo';
import type { MiddlewareHandler } from 'hono';
import type { ApiContext, ApiEnvironment } from './request.js';

export interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

// audit_eventsの列の上限に合わせ、大きすぎるクライアントのヘッダーでINSERTが失敗しないようにする。
const MAX_USER_AGENT_LENGTH = 1000;

function socketAddress(context: ApiContext): string | null {
  try {
    return getConnInfo(context).remote.address ?? null;
  } catch {
    // テストのapp.request()のようなプロセス内のリクエストにはNodeのソケットが無い。
    return null;
  }
}

/**
 * `trustedProxyHops`段のリバースプロキシの後ろにいるクライアントのアドレス。各プロキシは見た
 * アドレスをX-Forwarded-Forに追記する。それより左の項目はクライアントが書いたものなので無視し、
 * 偽のヘッダーでアドレスを選べないようにする。0段ならヘッダーをまったく読まない。
 */
export function clientAddressOf(request: {
  socketAddress: string | null;
  forwardedFor: string | undefined;
  trustedProxyHops: number;
}): string | null {
  if (request.trustedProxyHops === 0 || !request.forwardedFor) return request.socketAddress;
  const hops = request.forwardedFor.split(',').map((entry) => entry.trim());
  const client = hops[hops.length - request.trustedProxyHops];
  return client || request.socketAddress;
}

/** requestMetadata（監査、レート制限）用に、クライアントのアドレスをリクエストごとに1回求める。 */
export function clientAddress(trustedProxyHops: number): MiddlewareHandler<ApiEnvironment> {
  return async (context, next) => {
    context.set(
      'clientAddress',
      clientAddressOf({
        socketAddress: socketAddress(context),
        forwardedFor: context.req.header('X-Forwarded-For'),
        trustedProxyHops,
      }),
    );
    await next();
  };
}

export function requestMetadata(context: ApiContext): RequestMetadata {
  const userAgent = context.req.header('User-Agent');
  return {
    ipAddress: context.get('clientAddress') ?? socketAddress(context),
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
  };
}
