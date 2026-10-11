import { getConnInfo } from '@hono/node-server/conninfo';
import type { MiddlewareHandler } from 'hono';
import type { ApiContext, ApiEnvironment } from './request.js';

export interface RequestMetadata {
  ip: string | null;
  userAgent: string | null;
}

// Matches the audit_events column limits so oversized client headers cannot fail the INSERT.
const MAX_USER_AGENT_LENGTH = 1000;

function socketAddress(context: ApiContext): string | null {
  try {
    return getConnInfo(context).remote.address ?? null;
  } catch {
    // In-process requests such as app.request() in tests have no Node socket.
    return null;
  }
}

/**
 * The client's address behind `trustedProxyHops` reverse proxies that each append the address they
 * saw to X-Forwarded-For. Entries left of those are written by the client and ignored, so a
 * forged header cannot pick the address; with 0 hops the header is not read at all.
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

/** Resolves the client address once per request for requestMetadata (audit, rate limits). */
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
    ip: context.get('clientAddress') ?? socketAddress(context),
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
  };
}
