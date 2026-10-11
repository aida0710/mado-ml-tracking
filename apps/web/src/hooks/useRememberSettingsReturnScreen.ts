import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { Project } from '@mmt/contracts';
import { rememberSettingsReturnScreen } from '../lib/settingsReturnScreen';

/** Keeps the Project screen being shown, so 全体設定 opened from it can lead back there. */
export function useRememberSettingsReturnScreen(openProject: Project | undefined): void {
  const location = useLocation();
  const path = `${location.pathname}${location.search}`;
  useEffect(() => {
    if (openProject) rememberSettingsReturnScreen({ path, projectName: openProject.name });
  }, [openProject, path]);
}
