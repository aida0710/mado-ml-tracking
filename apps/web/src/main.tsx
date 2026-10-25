// Must stay the first import: it configures Zod before any schema is built.
import './zodConfig';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NavigationGuardProvider } from './components/NavigationGuardProvider';
import { initialTheme } from '@mado/design-system/theme';
import { THEME_STORAGE_KEY } from './lib/theme';
// Fonts and theme tokens shared with Mado. Noto Sans JP covers the Japanese text IBM Plex lacks.
import '@fontsource/noto-sans-jp/japanese-400.css';
import '@fontsource/noto-sans-jp/japanese-500.css';
import '@fontsource/noto-sans-jp/japanese-700.css';
import '@mado/design-system/fonts.css';
import '@mado/design-system/tokens.css';
// Element defaults, components, the app frame and the code view shared with Mado, before this
// app's area files.
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
// デザインシステム0.6.1の不具合を抑える仮の指定。直った版に上げたら消す。
import './styles/designSystemFixes.css';
import { localeStore } from './i18n/locale';

// The login screen and everything else start in the stored theme, or the operating system's.
document.documentElement.dataset.theme = initialTheme(THEME_STORAGE_KEY);
localeStore.applyToDocument();

// Keep the existing route tree while enabling blocked SPA navigation.
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
