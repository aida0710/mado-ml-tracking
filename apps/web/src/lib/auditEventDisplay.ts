import type { AuditEvent } from '@mmt/contracts';
import { accessText, auditActionLabels } from '../i18n/access';

/** 操作を言葉で出す。Webにまだラベルの無い操作は元の名前のまま出す。 */
export function auditActionLabel(action: string): string {
  return auditActionLabels[action] ?? action;
}

/**
 * 操作した人を表示名で出す。tokenによる操作はそうと分かるようにする。ユーザーは削除されないので、
 * 名前が無いのは`actorName`を送らないAPIの場合。それでもUUIDのままでは出さない。
 */
export function auditActorLabel(
  event: Pick<AuditEvent, 'actorType' | 'actorUserId' | 'actorName'>,
): string {
  if (event.actorType === 'system') return accessText.auditActorSystem;
  const name = event.actorName ?? (event.actorUserId ? accessText.auditActorUnknown : '—');
  return event.actorType === 'token' ? `${name} (${accessText.auditActorToken})` : name;
}

/** 全体の監査ログでのイベントのProject。認証とユーザーのイベントには無い。 */
export function auditProjectLabel(event: Pick<AuditEvent, 'projectId' | 'projectName'>): string {
  if (event.projectId === null) return accessText.auditProjectNone;
  return event.projectName ?? event.projectId;
}
