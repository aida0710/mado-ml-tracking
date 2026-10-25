import type { ProjectRole } from '@mmt/contracts';
import { canManagePlugins } from '../lib/permissions';
import { text } from '../i18n/catalog';
import {
  ADMIN_SECTIONS,
  GENERAL_SETTINGS_SECTIONS,
  SETTINGS_SECTION_LABELS,
  settingsSectionPath,
  type SettingsSection,
} from './settingsSections';

type ProjectScreen =
  | 'experiments'
  | 'sweeps'
  | 'reports'
  | 'models'
  | 'tasks'
  | 'codes'
  | 'datasets'
  | 'artifacts'
  | 'lineage'
  | 'jobs'
  | 'hooks'
  | 'workflows'
  | 'compute'
  | 'plugins'
  | 'settings';

// サイドバーとドロワーに出すProjectの画面の組。表示の順に並べる。
// 全体設定の画面は別の組を持ち、Projectを開いていないときだけ出す。
const SCREEN_GROUPS: { label: string; screens: ProjectScreen[] }[] = [
  { get label() { return text.navigationGroupTracking }, screens: ['experiments', 'sweeps', 'reports'] },
  { get label() { return text.navigationGroupModels }, screens: ['models', 'tasks', 'codes'] },
  { get label() { return text.navigationGroupData }, screens: ['datasets', 'artifacts', 'lineage'] },
  { get label() { return text.navigationGroupExecution }, screens: ['workflows', 'jobs', 'hooks', 'compute'] },
  { get label() { return text.navigationGroupProjectManagement }, screens: ['plugins', 'settings'] },
];

/** Projectの画面か、全体設定の画面（全体管理の画面を含む）。 */
export type NavigationScreen = ProjectScreen | SettingsSection;

export interface NavigationLink {
  screen: NavigationScreen;
  to: string;
  label: string;
}

export interface NavigationGroup {
  label: string;
  links: NavigationLink[];
}

interface NavigationAccess {
  projectId?: string;
  projectRole?: ProjectRole;
  isGlobalAdmin: boolean;
}

/** Projectを開いたときの最初の画面。そのProjectのExperiments。 */
export function projectHomePath(projectId: string): string {
  return `/projects/${projectId}/experiments`;
}

function settingsLinks(sections: readonly SettingsSection[]): NavigationLink[] {
  return sections.map((section) => ({
    screen: section,
    to: settingsSectionPath(section),
    label: SETTINGS_SECTION_LABELS[section],
  }));
}

/**
 * メインのナビゲーションに出す画面を組に分けて返す。Projectを開いているときはその画面
 * （Pluginsは管理できる人だけ）で、全体設定にはユーザーメニューから行く。開いていないとき
 * （全体設定の画面や、開くProjectが無いとき）は、全員に全体設定を、全体管理者には全体管理も出す。
 * リンクが1つも無い組は出さない。
 */
export function navigationGroups({
  projectId,
  projectRole,
  isGlobalAdmin,
}: NavigationAccess): NavigationGroup[] {
  if (!projectId) return settingsGroups(isGlobalAdmin);
  return SCREEN_GROUPS.map(({ label, screens }) => ({
    label,
    links: screens
      .filter((screen) => screen !== 'plugins' || canManagePlugins(projectRole, isGlobalAdmin))
      .map((screen) => ({ screen, to: `/projects/${projectId}/${screen}`, label: text[screen] })),
  })).filter((group) => group.links.length > 0);
}

function settingsGroups(isGlobalAdmin: boolean): NavigationGroup[] {
  const groups: NavigationGroup[] = [
    { label: text.globalSettings, links: settingsLinks(GENERAL_SETTINGS_SECTIONS) },
  ];
  if (isGlobalAdmin)
    groups.push({ label: text.administration, links: settingsLinks(ADMIN_SECTIONS) });
  return groups;
}

/** navigationGroupsと同じ画面を、1つの一覧にして返す。 */
export function navigationLinks(access: NavigationAccess): NavigationLink[] {
  return navigationGroups(access).flatMap((group) => group.links);
}
