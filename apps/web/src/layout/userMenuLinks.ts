import type { User } from '@mmt/contracts';
import type { UserMenuItem } from '@mado/design-system/react';
import { canChangeOwnPassword } from '../lib/permissions';
import { PASSWORD_CHANGE_PATH, settingsSectionPath } from './settingsSections';
import { text } from '../i18n/catalog';

/**
 * ユーザーメニューの項目: アカウント、ローカルアカウントならパスワードの変更、だれにでも全体設定。
 * 全体設定は利用者自身のページでなく設定全体を開くので、区切りの線で分ける。全体設定はアカウントの
 * 画面で開き、そのサイドバーからコンピュータと全体管理へ進む。
 */
export function userMenuLinks(user: Pick<User, 'authSources'>): UserMenuItem[] {
  const accountPath = settingsSectionPath('account');
  const passwordChange = { href: PASSWORD_CHANGE_PATH, label: text.passwordChange };
  return [
    { href: accountPath, label: text.account },
    ...(canChangeOwnPassword(user) ? [passwordChange] : []),
    { href: accountPath, label: text.globalSettings, startsGroup: true },
  ];
}
