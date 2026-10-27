import type { ProjectRole } from '@mmt/contracts';
import { useNavigationLayout, type NavigationLayout } from '@mado/design-system/react';
import { navigationGroups, type NavigationGroup } from '../layout/navigationLinks';
import { isGlobalAdmin } from '../lib/permissions';
import { useAuth } from './useAuth';
import { useShowsExecutionScreens } from './useShowsExecutionScreens';

// サイドバーの幅と畳んだ状態の保存キーの頭（<頭>.width・<頭>.collapsed）。mado S3 Data Catalogの設定と分ける。
const NAVIGATION_STORAGE_KEY_PREFIX = 'mmt.navigation';

export interface Navigation {
  /** 今の画面幅でのナビゲーションの出し方と、利用者が選んだサイドバーの幅・畳んだ状態。 */
  layout: NavigationLayout;
  /** ログイン中の利用者が開ける画面のリンクのまとまり。 */
  groups: NavigationGroup[];
}

export function useNavigation(projectId?: string, projectRole?: ProjectRole): Navigation {
  const auth = useAuth();
  const layout = useNavigationLayout({ storageKeyPrefix: NAVIGATION_STORAGE_KEY_PREFIX });
  const showsExecutionScreens = useShowsExecutionScreens(projectId);
  const groups = navigationGroups({
    projectId,
    projectRole,
    isGlobalAdmin: isGlobalAdmin(auth.user),
    showsExecutionScreens,
  });
  return { layout, groups };
}
