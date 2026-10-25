import type { ProjectRole, ServiceAccount } from '@mmt/contracts';
import type { SelectOption } from '../types/form';
import { automationText } from '../i18n/automation';

// 所有者がJobを開始するのに要るロール（APIも同じものを確かめる）。ルールの実行には
// Project admin、フックの開始にはeditorが要る。
export const RULE_OWNER_ROLES = ['admin'] as const;
export const HOOK_OWNER_ROLES = ['editor', 'admin'] as const;

/** ルールやフックの移し先にできるService Account。有効で、必要なロールを持つもの。 */
export function serviceAccountOwnerOptions(
  accounts: readonly ServiceAccount[],
  subject: { runAsUserId: string; roles: readonly ProjectRole[] },
): SelectOption[] {
  return accounts
    .filter(
      (account) =>
        account.status === 'active' &&
        account.role !== null &&
        subject.roles.includes(account.role) &&
        account.id !== subject.runAsUserId,
    )
    .map((account) => ({ value: account.id, label: account.name }));
}

/** 所有者を人かService Accountとして出す。名前が分からないときはidで代える。 */
export function automationOwnerLabel(
  owner: { runAsUserId: string; runAsKind?: 'human' | 'service'; runAsName?: string },
): string {
  const name = owner.runAsName || owner.runAsUserId;
  return owner.runAsKind === 'service'
    ? automationText.ownerServiceAccount(name)
    : automationText.ownerHuman(name);
}
