import type { Context } from 'hono';
import type { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import { DomainError } from '../domain/errors.js';
import { uuidSchema } from '../domain/validation.js';

export interface ApiEnvironment {
  Variables: { principal: Principal | null; clientAddress: string | null };
}
export type ApiContext = Context<ApiEnvironment>;

export function principal(context: ApiContext): Principal {
  const identity = context.get('principal');
  if (!identity) throw new DomainError({
    status: 401,
    code: 'authentication_required',
    message: 'authentication required',
  });
  return identity;
}

/**
 * 入力を検証する。誤りは 422 invalid_request で、どの項目かを文と `fields` に出す。項目の値は返さない
 * （秘密の値が入りうるため）。
 */
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const { issues } = parsed.error;
  throw new DomainError({
    status: 422,
    code: 'invalid_request',
    message: `invalid request: ${issues.map(describeIssue).join(', ')}`,
    details: { fields: [...new Set(issues.map(issueField))] },
  });
}

function issueField(issue: z.core.$ZodIssue): string {
  return issue.path.join('.') || 'body';
}

// 記録の形式の version は 2 だけを読む。1 を送ったクライアントには、要る version を文で伝える。
const SUPPORTED_RECORD_VERSION = 2;

function describeIssue(issue: z.core.$ZodIssue): string {
  const field = issueField(issue);
  const isUnsupportedVersion =
    issue.code === 'invalid_value' &&
    issue.values.length === 1 &&
    issue.values[0] === SUPPORTED_RECORD_VERSION &&
    issue.path.at(-1) === 'version';
  return isUnsupportedVersion
    ? `${field}: version ${SUPPORTED_RECORD_VERSION} is required; version 1 is not supported`
    : field;
}

export async function jsonBody<T>(context: ApiContext, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new DomainError({ status: 400, code: 'invalid_json', message: 'invalid JSON body' });
  }
  return parse(schema, body);
}

/** A body the client may leave out entirely; no body is read as `{}`. */
export async function optionalJsonBody<T>(context: ApiContext, schema: z.ZodType<T>): Promise<T> {
  if (!(await context.req.raw.clone().text()).trim()) return parse(schema, {});
  return jsonBody(context, schema);
}

export function uuidParam(context: ApiContext, name: string): string {
  return parse(uuidSchema, context.req.param(name));
}
