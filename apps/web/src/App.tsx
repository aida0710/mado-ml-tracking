import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthGate } from './components/AuthGate';
import { AppShell } from './layout/AppShell';
import { SettingsShell } from './layout/SettingsShell';
import { MlflowUiRedirect } from './layout/MlflowUiRedirect';
import { MLFLOW_UI_ROUTE } from './layout/mlflowUiPaths';
import {
  DEFAULT_SETTINGS_SECTION,
  PASSWORD_CHANGE_PATH,
  SETTINGS_PATH,
  settingsSectionPath,
} from './layout/settingsSections';
import { Loading } from './components/Feedback';
const ExperimentsPage = lazy(() =>
  import('./pages/ExperimentsPage').then((module) => ({ default: module.ExperimentsPage })),
);
const SweepsPage = lazy(() =>
  import('./pages/SweepsPage').then((module) => ({ default: module.SweepsPage })),
);
const SweepDetailPage = lazy(() =>
  import('./pages/SweepDetailPage').then((module) => ({ default: module.SweepDetailPage })),
);
const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then((module) => ({ default: module.ReportsPage })),
);
const ReportPage = lazy(() =>
  import('./pages/ReportPage').then((module) => ({ default: module.ReportPage })),
);
const RunDetailPage = lazy(() =>
  import('./pages/RunDetailPage').then((module) => ({ default: module.RunDetailPage })),
);
const ComparePage = lazy(() =>
  import('./pages/ComparePage').then((module) => ({ default: module.ComparePage })),
);
const ModelsPage = lazy(() =>
  import('./pages/ModelsPage').then((module) => ({ default: module.ModelsPage })),
);
const ModelVersionPage = lazy(() =>
  import('./pages/ModelVersionPage').then((module) => ({ default: module.ModelVersionPage })),
);
const CodesPage = lazy(() =>
  import('./pages/CodesPage').then((module) => ({ default: module.CodesPage })),
);
const DatasetsPage = lazy(() =>
  import('./pages/DatasetsPage').then((module) => ({ default: module.DatasetsPage })),
);
const ArtifactsPage = lazy(() =>
  import('./pages/ArtifactsPage').then((module) => ({ default: module.ArtifactsPage })),
);
const LineagePage = lazy(() =>
  import('./pages/LineagePage').then((module) => ({ default: module.LineagePage })),
);
const JobsPage = lazy(() =>
  import('./pages/JobsPage').then((module) => ({ default: module.JobsPage })),
);
const HooksPage = lazy(() =>
  import('./pages/HooksPage').then((module) => ({ default: module.HooksPage })),
);
const TasksPage = lazy(() =>
  import('./pages/TasksPage').then((module) => ({ default: module.TasksPage })),
);
const WorkflowsPage = lazy(() =>
  import('./pages/WorkflowsPage').then((module) => ({ default: module.WorkflowsPage })),
);
const WorkflowDetailPage = lazy(() =>
  import('./pages/WorkflowDetailPage').then((module) => ({ default: module.WorkflowDetailPage })),
);
const ComputePage = lazy(() =>
  import('./pages/ComputePage').then((module) => ({ default: module.ComputePage })),
);
const PluginsPage = lazy(() =>
  import('./pages/PluginsPage').then((module) => ({ default: module.PluginsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const AccountPage = lazy(() =>
  import('./pages/AccountPage').then((module) => ({ default: module.AccountPage })),
);
const PasswordChangePage = lazy(() =>
  import('./pages/PasswordChangePage').then((module) => ({ default: module.PasswordChangePage })),
);
const AboutPage = lazy(() =>
  import('./pages/AboutPage').then((module) => ({ default: module.AboutPage })),
);
const ComputersSettingsPage = lazy(() =>
  import('./pages/ComputersSettingsPage').then((module) => ({
    default: module.ComputersSettingsPage,
  })),
);
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })),
);

export function App() {
  return (
    <AuthGate>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<AppShell />} />
          <Route element={<SettingsShell />}>
            <Route
              path={SETTINGS_PATH}
              element={<Navigate replace to={settingsSectionPath(DEFAULT_SETTINGS_SECTION)} />}
            />
            <Route path={settingsSectionPath('account')} element={<AccountPage />} />
            <Route path={PASSWORD_CHANGE_PATH} element={<PasswordChangePage />} />
            <Route path={settingsSectionPath('computers')} element={<ComputersSettingsPage />} />
            <Route path={settingsSectionPath('about')} element={<AboutPage />} />
            {/* 全体管理の各画面。全体管理者でない人と知らない画面名は、AdminPageがアカウントへ送る。 */}
            <Route path={`${SETTINGS_PATH}/:section`} element={<AdminPage />} />
          </Route>
          <Route path="/projects/:projectId" element={<AppShell />}>
            <Route index element={<Navigate replace to="experiments" />} />
            <Route path="experiments" element={<ExperimentsPage />} />
            <Route path="sweeps" element={<SweepsPage />} />
            <Route path="sweeps/:sweepId" element={<SweepDetailPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="reports/:reportId" element={<ReportPage />} />
            <Route path="runs/:runId" element={<RunDetailPage />} />
            <Route path="compare" element={<ComparePage />} />
            <Route path="models" element={<ModelsPage />} />
            <Route path="models/:modelId/versions/:versionId" element={<ModelVersionPage />} />
            <Route path="codes" element={<CodesPage />} />
            <Route path="datasets" element={<DatasetsPage />} />
            <Route path="artifacts" element={<ArtifactsPage />} />
            <Route path="lineage" element={<LineagePage />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="hooks" element={<HooksPage />} />
            <Route path="workflows" element={<WorkflowsPage />} />
            <Route path="workflows/:workflowId" element={<WorkflowDetailPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="compute" element={<ComputePage />} />
            <Route path="plugins" element={<PluginsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path={MLFLOW_UI_ROUTE} element={<MlflowUiRedirect />} />
            <Route path="*" element={<Navigate replace to="experiments" />} />
          </Route>
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Suspense>
    </AuthGate>
  );
}
