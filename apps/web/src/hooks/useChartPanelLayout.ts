import { createContext, useCallback, useContext, useState } from 'react';
import type { ChartPanelLayout } from '@mmt/contracts';
import { useLatestRef } from './useLatestRef';
import { parseChartPanelLayout } from '../lib/chartPanelLayout';

// 利用者が並べた図のパネル。Projectとページごとに、このブラウザに保存する。Viewerも図を並べる
// ので、配置は利用者自身のもの。サーバーに届くのは保存ビューの中に入れたときだけ。
const CHART_LAYOUT_STORAGE_PREFIX = 'mmt.chartPanels.v1';

/** パネルの配置をそれぞれ持つページ。 */
export type ChartLayoutPage = 'runDetail' | 'compare' | 'runList';

const storageKey = (projectId: string, page: ChartLayoutPage) =>
  `${CHART_LAYOUT_STORAGE_PREFIX}:${projectId}:${page}`;

/**
 * このブラウザの保存領域の代わりにページが持つ配置。Runの一覧で開いている保存ビューのもので、
 * 変更はビューを保存するまで未保存のまま。`null`なら既定の配置を出す。
 */
export interface ChartPanelLayoutSource {
  layout: ChartPanelLayout | null;
  onChange: (layout: ChartPanelLayout | null) => void;
}
export const ChartPanelLayoutSourceContext = createContext<ChartPanelLayoutSource | null>(null);

/** このブラウザに保存した配置。保存ビューを開いていないときにページが出すもの。 */
export const readStoredChartPanelLayout = (projectId: string, page: ChartLayoutPage) =>
  readStoredLayout(storageKey(projectId, page));

function readStoredLayout(key: string): ChartPanelLayout | null {
  try {
    const stored = window.localStorage.getItem(key);
    // 壊れた値や古い形式の値なら、ページを失敗させずに既定の配置を使う。
    return stored ? parseChartPanelLayout(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function writeStoredLayout(key: string, layout: ChartPanelLayout | null) {
  try {
    if (layout) window.localStorage.setItem(key, JSON.stringify(layout));
    else window.localStorage.removeItem(key);
  } catch {
    // 保存領域が使えない（プライベートウィンドウ、容量の上限）ときは、配置はページを離れるまで続く。
  }
}

/**
 * 保存した配置。利用者が何か変えるまでは`defaultLayout`。既定の配置はページが今持っている
 * メトリクスに合わせて変わるので、利用者がパネルを並べるまで保存しない。
 * ChartPanelLayoutSourceContextの中では、その配置を使い、ここには何も保存しない。
 */
export function useChartPanelLayout(
  projectId: string,
  page: ChartLayoutPage,
  defaultLayout: ChartPanelLayout,
) {
  const source = useContext(ChartPanelLayoutSourceContext);
  const key = storageKey(projectId, page);
  const [stored, setStored] = useState(() => ({ key, layout: readStoredLayout(key) }));
  if (stored.key !== key) setStored({ key, layout: readStoredLayout(key) });
  const storedLayout = stored.key === key ? stored.layout : null;
  const chosenLayout = source ? source.layout : storedLayout;
  const layout = chosenLayout ?? defaultLayout;
  // updateLayoutはrefにも書くので、次のレンダリングまでに2回変えても、後の変更は前の変更の上に重なる。
  const layoutRef = useLatestRef(layout);

  const saveLayout = useCallback(
    (next: ChartPanelLayout | null) => {
      if (source) {
        source.onChange(next);
        return;
      }
      writeStoredLayout(key, next);
      setStored({ key, layout: next });
    },
    [key, source],
  );
  const updateLayout = useCallback(
    (change: (layout: ChartPanelLayout) => ChartPanelLayout) => {
      const next = change(layoutRef.current);
      layoutRef.current = next;
      saveLayout(next);
    },
    [layoutRef, saveLayout],
  );
  const resetLayout = useCallback(() => saveLayout(null), [saveLayout]);
  return {
    layout,
    isCustomized: chosenLayout !== null,
    updateLayout,
    resetLayout,
  };
}
