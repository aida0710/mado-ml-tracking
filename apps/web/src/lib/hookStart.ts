import { HOOK_PAYLOAD_MAX_BYTES, type HookTriggerRequest } from '@mmt/contracts';
import { parseJsonObject } from './formValues';
import { LocalizedError } from './localizedError';
import { hooksTextTemplates } from '../i18n/hooks';

const BYTES_PER_KIB = 1024;

/**
 * The request of a manual start: the payload is an optional JSON object that reaches the Job as
 * trigger-payload.json, within the API's size limit.
 */
export function buildHookStartRequest(payload: string, idempotencyKey: string): HookTriggerRequest {
  if (!payload.trim()) return { idempotencyKey };
  const parsed = parseJsonObject(payload);
  if (new TextEncoder().encode(JSON.stringify(parsed)).length > HOOK_PAYLOAD_MAX_BYTES)
    throw new LocalizedError(() => hooksTextTemplates.hookPayloadTooLarge(HOOK_PAYLOAD_MAX_BYTES / BYTES_PER_KIB));
  return { payload: parsed, idempotencyKey };
}
