import { useEffect, useState, type CSSProperties } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Project } from '@mmt/contracts';
import { administrationApi } from '../api/administration';
import { useAuth } from '../hooks/useAuth';
import { useQuery } from '../hooks/useQuery';
import { ProjectContext } from '../hooks/useProject';
import { useNavigation } from '../hooks/useNavigation';
import { useRememberSettingsReturnScreen } from '../hooks/useRememberSettingsReturnScreen';
import { Loading, Resource } from '../components/Feedback';
import { ProjectCreateDialog } from '../dialogs/ProjectCreateDialog';
import { ProjectListPage } from '../pages/ProjectListPage';
import { canCreateProject } from '../lib/permissions';
import { projectToOpen, readLastProjectId, rememberLastProjectId } from '../lib/lastOpenedProject';
import { readArchivedProjectName } from '../lib/archivedProjectState';
import { TopBar } from './TopBar';
import { ProjectBar } from './ProjectBar';
import { NavigationSidebar } from './NavigationSidebar';
import { projectHomePath } from './navigationLinks';
import { useLocale } from '../i18n/useLocale';

export function AppShell() {
  useLocale();
  const { projectId } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  // Right after archiving, "/" lists the Projects with a note instead of opening another one.
  const archivedProjectName = readArchivedProjectName(useLocation().state);
  const projects = useQuery('projects', administrationApi.projects);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const startCreatingProject = canCreateProject(auth.user)
    ? () => setIsCreatingProject(true)
    : undefined;
  const openCreatedProject = (project: Project) => {
    setIsCreatingProject(false);
    projects.reload();
    navigate(projectHomePath(project.id));
  };
  // A Project id from the URL that the user cannot open gets no Project navigation or alerts.
  const openProject = projects.value?.find((project) => project.id === projectId);
  useEffect(() => {
    if (openProject) rememberLastProjectId(openProject.id);
  }, [openProject]);
  useRememberSettingsReturnScreen(openProject);
  const navigation = useNavigation(openProject?.id, openProject?.role);
  // The Project switcher heads the full sidebar; with the rail or the drawer it is the bar under
  // the header.
  const inSidebar = navigation.layout.mode === 'sidebar';
  const projectPicker = projects.value?.length ? (
    <ProjectBar
      projects={projects.value}
      project={openProject}
      placement={inSidebar ? 'sidebar' : 'bar'}
      onCreateProject={startCreatingProject}
    />
  ) : null;
  return (
    <div
      className="app-shell"
      data-navigation={navigation.layout.mode}
      data-project-bar={projectPicker && !inSidebar ? 'true' : undefined}
      style={{ '--navigation-width': `${navigation.layout.width}px` } as CSSProperties}
    >
      <TopBar projectId={openProject?.id} navigation={navigation} />
      <div className="app-body">
        {navigation.layout.mode !== 'drawer' && (projectPicker || navigation.groups.length > 0) && (
          <NavigationSidebar navigation={navigation} header={projectPicker} />
        )}
        <div className="app-content">
          {!inSidebar && projectPicker}
          <Resource query={projects}>
            {(items) => {
              const project = items.find((item) => item.id === projectId);
              // A list being reloaded may still lack a Project just created, or still hold one
              // just archived; wait for it instead of showing the wrong screen.
              if (!project && projects.loading) return <Loading />;
              const projectAtHome =
                projectId || archivedProjectName
                  ? undefined
                  : projectToOpen(items, readLastProjectId());
              if (projectAtHome) return <Navigate replace to={projectHomePath(projectAtHome.id)} />;
              return project ? (
                <ProjectContext.Provider
                  value={{ project, projects: items, reloadProjects: projects.reload }}
                >
                  <main id="content" className="workspace" key={project.id}>
                    <Outlet />
                  </main>
                </ProjectContext.Provider>
              ) : (
                <ProjectListPage
                  projects={items}
                  unreachableProjectId={projectId}
                  archivedProjectName={archivedProjectName}
                  onCreateProject={startCreatingProject}
                />
              );
            }}
          </Resource>
        </div>
      </div>
      {isCreatingProject && (
        <ProjectCreateDialog
          existingNames={projects.value?.map((project) => project.name) ?? []}
          onClose={() => setIsCreatingProject(false)}
          onCreated={openCreatedProject}
        />
      )}
    </div>
  );
}
