import { useNavigationLayout, type NavigationLayout } from '@mado/design-system/react';
import {
  globalSettingsLink,
  navigationGroups,
  type NavigationGroup,
  type NavigationLink,
} from '../layout/navigationLinks';
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
  /** 並びの下端に置くリンク。Projectの画面では全体設定への入口、ほかではnull。 */
  footerLink: NavigationLink | null;
}

export function useNavigation(projectId?: string): Navigation {
  const auth = useAuth();
  const layout = useNavigationLayout({ storageKeyPrefix: NAVIGATION_STORAGE_KEY_PREFIX });
  const showsExecutionScreens = useShowsExecutionScreens(projectId);
  const groups = navigationGroups({
    projectId,
    isGlobalAdmin: isGlobalAdmin(auth.user),
    showsExecutionScreens,
  });
  return { layout, groups, footerLink: globalSettingsLink(projectId) };
}
