import { HOOK_PAYLOAD_MAX_BYTES, type HookTriggerRequest } from '@mmt/contracts';
import { parseJsonObject } from './formValues';
import { LocalizedError } from './localizedError';
import { hooksTextTemplates } from '../i18n/hooks';

const BYTES_PER_KIB = 1024;

/**
 * 手動の起動の要求。payloadは任意のJSONオブジェクトで、APIの大きさの上限の範囲でJobに
 * trigger-payload.jsonとして届く。
 */
export function buildHookStartRequest(payload: string, idempotencyKey: string): HookTriggerRequest {
  if (!payload.trim()) return { idempotencyKey };
  const parsed = parseJsonObject(payload);
  if (new TextEncoder().encode(JSON.stringify(parsed)).length > HOOK_PAYLOAD_MAX_BYTES)
    throw new LocalizedError(() => hooksTextTemplates.hookPayloadTooLarge(HOOK_PAYLOAD_MAX_BYTES / BYTES_PER_KIB));
  return { payload: parsed, idempotencyKey };
}
