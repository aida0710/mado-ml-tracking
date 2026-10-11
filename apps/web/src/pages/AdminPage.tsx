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

// Each section heads itself (SettingsPageHeader) with its own actions; the sidebar switches them.
const ADMIN_SECTION_PANELS: Record<AdminSection, ComponentType> = {
  projects: ProjectsPanel,
  users: UsersPanel,
  storage: StorageBackendsPanel,
  launchers: LaunchersPanel,
  audit: AuditEventsPanel,
};

/**
 * 全体設定 → 全体管理 (/settings/<section>), for global administrators. Anyone else, whom the API
 * would refuse, lands on the user's own account in 全体設定 with a note saying why; an unknown
 * section lands there without one.
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
