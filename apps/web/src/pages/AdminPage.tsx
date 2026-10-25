import type { ComponentType } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { AuditEventsPanel } from '../components/admin/AuditEventsPanel';
import { LaunchersPanel } from '../components/admin/LaunchersPanel';
import { ProjectsPanel } from '../components/admin/ProjectsPanel';
import { StorageBackendsPanel } from '../components/admin/StorageBackendsPanel';
import { UsersPanel } from '../components/admin/UsersPanel';
import { useAuth } from '../hooks/useAuth';
import { isGlobalAdmin } from '../lib/permissions';
import {
  DEFAULT_SETTINGS_SECTION,
  isAdminSection,
  settingsSectionPath,
  type AdminSection,
} from '../layout/settingsSections';
import type { AdminOnlyRedirectState } from '../layout/AdminOnlyRedirectNotice';

// 各セクションは自分の見出し（SettingsPageHeader）と操作を持ち、サイドバーで切り替える。
const ADMIN_SECTION_PANELS: Record<AdminSection, ComponentType> = {
  projects: ProjectsPanel,
  users: UsersPanel,
  storage: StorageBackendsPanel,
  launchers: LaunchersPanel,
  audit: AuditEventsPanel,
};

/**
 * 全体設定 → 全体管理（/settings/<section>）。全体管理者向け。APIが拒むほかの人は、全体設定の
 * 本人のアカウントへ移して理由を表示する。知らないセクションは、理由なしで同じ所へ移す。
 */
export function AdminPage() {
  const auth = useAuth();
  const { section } = useParams();
  if (!isAdminSection(section))
    return <Navigate replace to={settingsSectionPath(DEFAULT_SETTINGS_SECTION)} />;
  if (!isGlobalAdmin(auth.user)) {
    const state: AdminOnlyRedirectState = { redirectedFromAdminSection: true };
    return <Navigate replace to={settingsSectionPath(DEFAULT_SETTINGS_SECTION)} state={state} />;
  }
  const Panel = ADMIN_SECTION_PANELS[section];
  return <Panel />;
}
