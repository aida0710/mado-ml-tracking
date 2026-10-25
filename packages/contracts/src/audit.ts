import type { JsonObject } from './index.js';

export type AuditActorType = 'user' | 'token' | 'system';
export type AuditOutcome = 'success' | 'denied' | 'failure';

export interface AuditEvent {
  id: string;
  occurredAt: string;
  actorType: AuditActorType;
  actorUserId: string | null;
  // actorUserIdの今の表示名。画面がUUIDをそのまま出さずに済むようにする。
  actorName: string | null;
  actorTokenId: string | null;
  action: string;
  outcome: AuditOutcome;
  resourceType: string;
  resourceId: string | null;
  projectId: string | null;
  projectName: string | null;
  details: JsonObject;
  ipAddress: string | null;
  userAgent: string | null;
}

/** 監査イベントのkeysetページングの1ページ（新しい順）。nextCursorは次に`cursor`として渡すid。 */
export interface AuditEventPage {
  items: AuditEvent[];
  nextCursor: string | null;
}
