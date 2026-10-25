import type { ComputeTargetOverview } from '@mmt/contracts';
import { formatDate } from './format';
import { text, textTemplates } from '../i18n/catalog';

/**
 * 全体設定 → コンピュータの行で詳細を開けるか。そのコンピュータを使える人（job shellと本人の
 * 設定）か、管理できる人なら開ける。ほかの人のPrivateのコンピュータは行のまま。
 */
export const canOpenTargetDetails = (
  target: Pick<ComputeTargetOverview, 'usable' | 'canManage'>,
): boolean => target.usable || target.canManage;

/**
 * 状態の列に出す、自動のsiteのランチャーの状況。未設定、失効、一度も応答が無い、または最後に
 * 問い合わせた日時。ほかのコンピュータには報告するランチャーが無い（null）。
 */
export function launcherStatusLabel(
  target: Pick<ComputeTargetOverview, 'executor' | 'submissionMode' | 'launcher'>,
): string | null {
  if (target.executor !== 'site' || target.submissionMode !== 'automatic') return null;
  const { launcher } = target;
  if (!launcher) return text.computerLauncherMissing;
  if (launcher.revoked) return text.computerLauncherRevoked;
  if (!launcher.lastSeenAt) return text.computerLauncherNeverSeen;
  return textTemplates.computerLauncherSeen(launcher.name, formatDate(launcher.lastSeenAt));
}
