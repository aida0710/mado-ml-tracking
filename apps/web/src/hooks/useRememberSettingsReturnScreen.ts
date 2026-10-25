import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { Project } from '@mmt/contracts';
import { rememberSettingsReturnScreen } from '../lib/settingsReturnScreen';

/** 表示中のProjectの画面を覚えておき、そこから開いた全体設定から戻れるようにする。 */
export function useRememberSettingsReturnScreen(openProject: Project | undefined): void {
  const location = useLocation();
  const path = `${location.pathname}${location.search}`;
  useEffect(() => {
    if (openProject) rememberSettingsReturnScreen({ path, projectName: openProject.name });
  }, [openProject, path]);
}
