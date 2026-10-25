import * as english from './en/shell';
import { localized } from './localized';
// どの画面にも共通のアプリの枠。ナビゲーションのサイドバーとドロワー、レスポンシブな表。
export const shellText = localized({
  openNavigation: 'メニューを開く',
  closeNavigation: 'メニューを閉じる',
  collapseNavigation: 'サイドバーをアイコンだけにする',
  expandNavigation: 'サイドバーを広げる',
  resizeNavigation: 'サイドバーの幅',
  navigationSidebar: 'サイドバー',
  navigationGroupTracking: '記録',
  navigationGroupModels: 'モデル',
  navigationGroupData: 'データ',
  navigationGroupExecution: '実行',
  navigationGroupProjectManagement: 'プロジェクト管理',
  showRowDetails: '詳細を表示',
  hideRowDetails: '詳細を閉じる',
} as const, english.shellText);
