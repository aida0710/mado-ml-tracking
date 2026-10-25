import { text } from '../i18n/catalog';

/** Projectの設定ページの各部分の要素id。ページとその目次の両方が読む。 */
export const PROJECT_SETTINGS_SECTION_IDS = {
  project: 'settings-project',
  usage: 'settings-usage',
  connection: 'settings-connection',
  members: 'settings-members',
  groups: 'settings-groups',
  serviceAccounts: 'settings-service-accounts',
  tokens: 'settings-tokens',
  notifications: 'settings-notifications',
  audit: 'settings-audit',
  archive: 'settings-archive',
} as const;

/** Projectの設定ページで、上部の目次からリンクする部分。 */
export interface ProjectSettingsSection {
  id: string;
  label: string;
}

const ids = PROJECT_SETTINGS_SECTION_IDS;
// ページの部分を表示順に並べる。admin専用の部分は、各部分が自分で判断してProject adminにだけ
// 出す（Service Account、通知、監査ログ、アーカイブ）。ラベルが表示言語に従うよう、呼ぶたびに
// 作る。
const getSections = (): (ProjectSettingsSection & { isAdminOnly: boolean })[] => [
  { id: ids.project, label: text.project, isAdminOnly: false },
  { id: ids.usage, label: text.artifactUsage, isAdminOnly: false },
  { id: ids.connection, label: text.recordingConnection, isAdminOnly: false },
  { id: ids.members, label: text.members, isAdminOnly: false },
  { id: ids.groups, label: text.groupBindings, isAdminOnly: false },
  { id: ids.serviceAccounts, label: text.serviceAccounts, isAdminOnly: true },
  { id: ids.tokens, label: text.personalTokens, isAdminOnly: false },
  { id: ids.notifications, label: text.notifications, isAdminOnly: true },
  { id: ids.audit, label: text.auditEvents, isAdminOnly: true },
  { id: ids.archive, label: text.projectArchiveTitle, isAdminOnly: true },
];

/** この利用者に見える、Projectの設定ページの部分。目次に使う。 */
export function projectSettingsSections(isProjectAdmin: boolean): ProjectSettingsSection[] {
  return getSections().filter((section) => isProjectAdmin || !section.isAdminOnly).map(
    ({ id, label }) => ({ id, label }),
  );
}
