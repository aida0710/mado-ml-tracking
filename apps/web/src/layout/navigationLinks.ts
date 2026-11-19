import { text } from '../i18n/catalog';
import {
  ADMIN_SECTIONS,
  DEFAULT_SETTINGS_SECTION,
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
  | 'settings';

// サイドバーとドロワーに出すProjectの画面の組。表示の順に並べる。
// 全体設定の画面は別の組を持ち、Projectを開いていないときだけ出す。Projectを開いている間は、
// 全体設定への入口を1つだけ、並びの下端に置く（globalSettingsLink）。
const SCREEN_GROUPS: { label: string; screens: ProjectScreen[] }[] = [
  { get label() { return text.navigationGroupTracking }, screens: ['experiments', 'sweeps', 'reports'] },
  { get label() { return text.navigationGroupModels }, screens: ['models', 'tasks', 'codes'] },
  { get label() { return text.navigationGroupData }, screens: ['datasets', 'artifacts', 'lineage'] },
  { get label() { return text.navigationGroupExecution }, screens: ['workflows', 'jobs', 'hooks', 'compute'] },
  { get label() { return text.navigationGroupProjectManagement }, screens: ['settings'] },
];

// Jobを動かす機能の画面。Jobを動かせるコンピュータが無いProjectでは使えないので、
// サイドバーに出さない（URLで開けば今までどおり表示する）。
const EXECUTION_SCREENS: readonly ProjectScreen[] = [
  'sweeps',
  'tasks',
  'codes',
  'workflows',
  'jobs',
  'hooks',
  'compute',
];

/** Projectの画面から全体設定へ移る入口。全体設定のどの画面でもなく、全体設定そのものを指す。 */
type GlobalSettingsEntry = 'globalSettings';

/** Projectの画面か、全体設定の画面（全体管理の画面を含む）か、全体設定への入口。 */
export type NavigationScreen = ProjectScreen | SettingsSection | GlobalSettingsEntry;

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
  isGlobalAdmin: boolean;
  /** Projectで実行の画面を出すか（useShowsExecutionScreens）。Projectを開いていないときは使わない。 */
  showsExecutionScreens?: boolean;
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
 * （実行の画面はJobを動かせるコンピュータがあるときだけ）で、全体設定には並びの下端の入口
 * （globalSettingsLink）かユーザーメニューから行く。開いていないとき
 * （全体設定の画面や、開くProjectが無いとき）は、全員に全体設定を、全体管理者には全体管理も出す。
 * リンクが1つも無い組は出さない。
 */
export function navigationGroups({
  projectId,
  isGlobalAdmin,
  showsExecutionScreens = false,
}: NavigationAccess): NavigationGroup[] {
  if (!projectId) return settingsGroups(isGlobalAdmin);
  return SCREEN_GROUPS.map(({ label, screens }) => ({
    label,
    links: screens
      .filter((screen) => showsExecutionScreens || !EXECUTION_SCREENS.includes(screen))
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

/**
 * Projectの画面の並びの下端に置く、全体設定への入口。全体設定はアカウントの画面で開き、その
 * サイドバーからほかの画面へ進む。Projectを開いていないときは全体設定の画面がもう並んでいるので
 * 出さない。
 */
export function globalSettingsLink(projectId: string | undefined): NavigationLink | null {
  if (!projectId) return null;
  return {
    screen: 'globalSettings',
    to: settingsSectionPath(DEFAULT_SETTINGS_SECTION),
    label: text.globalSettings,
  };
}

/** navigationGroupsと同じ画面を、1つの一覧にして返す。 */
export function navigationLinks(access: NavigationAccess): NavigationLink[] {
  return navigationGroups(access).flatMap((group) => group.links);
}
