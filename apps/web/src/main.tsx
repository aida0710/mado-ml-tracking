// 必ず最初のimportにしておく。どのschemaよりも先にZodを設定する。
import './zodConfig';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NavigationGuardProvider } from './components/NavigationGuardProvider';
import { initialTheme } from '@mado/design-system/theme';
import { THEME_STORAGE_KEY } from './lib/theme';
// mado S3 Data Catalogと共有するフォントとテーマのトークン。IBM Plexに無い日本語の文字は
// Noto Sans JPで補う。
import '@fontsource/noto-sans-jp/japanese-400.css';
import '@fontsource/noto-sans-jp/japanese-500.css';
import '@fontsource/noto-sans-jp/japanese-700.css';
import '@mado/design-system/fonts.css';
import '@mado/design-system/tokens.css';
// mado S3 Data Catalogと共有する要素の既定のスタイル、部品、アプリの枠、コードの表示。このアプリの
// 区域ごとのファイルより先に読み込む。
import '@mado/design-system/base.css';
import '@mado/design-system/components.css';
import '@mado/design-system/shell.css';
import '@mado/design-system/code.css';
import '@xyflow/react/dist/style.css';
// 来歴のグラフの色・項目のカード・検索欄（React Flowの既定の見た目を上書きするので、その後に読み込む）。
import '@mado/design-system/lineage.css';
// 画面の区域ごとのスタイルシート。同じ詳細度の指定は後の方が勝つので、このアプリの変数を持つbaseを
// 先頭に置く。新しい指定は、何でも入るスタイルシートを作らず、その区域のファイルに足す。
import './styles/base.css';
import './styles/layout.css';
import './styles/tables.css';
import './styles/registry.css';
import './styles/lineage.css';
import './styles/jobs.css';
import './styles/artifacts.css';
import './styles/artifactBrowser.css';
import './styles/audio.css';
import './styles/artifactPreviews.css';
import './styles/forms.css';
import './styles/choiceField.css';
import './styles/workflows.css';
import './styles/workbench.css';
import './styles/narrowModelScreens.css';
import './styles/admin.css';
import './styles/settingsGuidance.css';
import './styles/projectAccess.css';
import './styles/promotion.css';
import './styles/uploads.css';
import './styles/modelVersion.css';
import './styles/checkpoints.css';
import './styles/connection.css';
import './styles/tokenExpiry.css';
import './styles/operations.css';
import './styles/charts.css';
import './styles/chartPanels.css';
import './styles/analysis.css';
import './styles/sweeps.css';
import './styles/media.css';
import './styles/comments.css';
import './styles/reports.css';
import './styles/savedViews.css';
import './styles/comparison.css';
import './styles/runList.css';
import './styles/datasets.css';
import './styles/responsiveManagement.css';
import './styles/siteComputers.css';
import './styles/computerSetup.css';
import './styles/tabs.css';
import { localeStore } from './i18n/locale';

// ログイン画面もほかの画面も、保存したテーマか、OSのテーマで始める。
document.documentElement.dataset.theme = initialTheme(THEME_STORAGE_KEY);
localeStore.applyToDocument();

// 今のルートの構成を保ったまま、SPAの画面遷移を止められるようにする。
const router = createBrowserRouter([{
  path: '*',
  element: <ErrorBoundary><NavigationGuardProvider><App /></NavigationGuardProvider></ErrorBoundary>,
}]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>,
);
