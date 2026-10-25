import { text } from '../i18n/catalog';

/** 全体設定。どのProjectにも属さない画面で、それぞれ/settings/<section>にある。 */
export const SETTINGS_PATH = '/settings';

/** 全体設定の組。ログインした利用者なら誰でも開ける。並びはサイドバーの順。 */
export const GENERAL_SETTINGS_SECTIONS = ['account', 'computers', 'about'] as const;
export type GeneralSettingsSection = (typeof GENERAL_SETTINGS_SECTIONS)[number];

/** 全体管理の組。全体管理者だけが開ける。並びはサイドバーの順。 */
export const ADMIN_SECTIONS = ['projects', 'users', 'storage', 'launchers', 'audit'] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export type SettingsSection = GeneralSettingsSection | AdminSection;

// /settingsは利用者本人のアカウントを開く。どの利用者にもある画面。
export const DEFAULT_SETTINGS_SECTION: GeneralSettingsSection = 'account';

export const SETTINGS_SECTION_LABELS: Record<SettingsSection, string> = {
  get account() { return text.account; },
  get computers() { return text.settingsSectionComputers; },
  get about() { return text.settingsSectionAbout; },
  get projects() { return text.adminSectionProjects; },
  get users() { return text.adminSectionUsers; },
  get storage() { return text.adminSectionStorage; },
  get launchers() { return text.adminSectionLaunchers; },
  get audit() { return text.adminSectionAudit; },
};

export function settingsSectionPath(section: SettingsSection): string {
  return `${SETTINGS_PATH}/${section}`;
}

/** 全体設定 → コンピュータで1台の詳細を開いた状態（ComputersSettingsPageが`computer`を読む）。 */
export const COMPUTER_DETAILS_PARAM = 'computer';

export function computerDetailsPath(targetId: string): string {
  return `${settingsSectionPath('computers')}?${new URLSearchParams({ [COMPUTER_DETAILS_PARAM]: targetId })}`;
}

/** ローカルアカウントはここでパスワードを変える。アカウントの画面に属する。 */
export const PASSWORD_CHANGE_PATH = `${settingsSectionPath('account')}/password`;

export function isAdminSection(value: string | undefined): value is AdminSection {
  return (ADMIN_SECTIONS as readonly string[]).includes(value ?? '');
}
