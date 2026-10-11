import { text } from '../i18n/catalog';

/** Element ids of the Project settings page's parts; the page and its contents both read these. */
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

/** A part of the Project settings page that the contents at its top links to. */
export interface ProjectSettingsSection {
  id: string;
  label: string;
}

const ids = PROJECT_SETTINGS_SECTION_IDS;
// The page's parts in display order. Admin-only parts are shown to Project admins alone, as each
// part decides for itself (Service Accounts, notifications, the audit log and archiving). Built on
// each call so the labels follow the display language.
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

/** The parts of the Project settings page this user sees, for its contents. */
export function projectSettingsSections(isProjectAdmin: boolean): ProjectSettingsSection[] {
  return getSections().filter((section) => isProjectAdmin || !section.isAdminOnly).map(
    ({ id, label }) => ({ id, label }),
  );
}
