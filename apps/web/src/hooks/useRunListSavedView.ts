import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ChartPanelLayout, SavedView, SavedViewColumn, SavedViewState } from '@mmt/contracts';
import { readStoredChartPanelLayout, type ChartPanelLayoutSource } from './useChartPanelLayout';
import { useSavedViews, type SavedViewUnavailableReason } from './useSavedViews';
import {
  hasUnsavedChanges,
  toRunListDisplay,
  toSavedViewState,
} from '../lib/savedViewState';
import { RUN_LIST_PARAMS, runListParamsForView, type RunListConditions } from '../lib/runListUrl';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

const unavailableViewNotice: Record<SavedViewUnavailableReason, string> = {
  get not_found() { return text.savedViewNotFound; },
  get unsupported_version() { return text.savedViewUnsupportedVersion; },
  get invalid() { return text.savedViewInvalid; },
};

/**
 * Runの一覧で開いている保存ビュー（`?view=<id>`）と、URLの外にある表示の部分（列と、ビューを
 * 開いている間はその図の配置）。ビューを開くと条件をURLに書く。その後、保存した状態と違う点が
 * あれば未保存の変更になる。
 */
export function useRunListSavedView({
  projectId,
  conditions,
  defaultColumns,
}: {
  projectId: string;
  conditions: RunListConditions;
  /** 利用者が列を並べていない間に出す。ページのRunに合わせて変わる。 */
  defaultColumns: SavedViewColumn[];
}) {
  useLocale();
  const [params, setParams] = useSearchParams();
  const viewId = params.get(RUN_LIST_PARAMS.view) ?? '';
  const { views, opened } = useSavedViews(projectId, 'runs', viewId);
  const [customColumns, setCustomColumns] = useState<SavedViewColumn[] | null>(null);
  const [activeView, setActiveView] = useState<SavedView | null>(null);
  const [viewChartPanels, setViewChartPanels] = useState<ChartPanelLayout | null>(null);
  const [noticeReason, setNoticeReason] = useState<SavedViewUnavailableReason | null>(null);
  // 保存の直後にURLに入れたビュー。ルーターはstateの後でURLを反映するので、それまでURLはまだ
  // 前のビュー（または無し）を指しており、それに従ってはいけない。
  const [savedViewId, setSavedViewId] = useState<string | null>(null);
  // 最後にURLに従って開いたビュー。その条件を、続けてURLに書く。
  const [viewOpenedFromUrl, setViewOpenedFromUrl] = useState<{
    view: SavedView;
    state: SavedViewState;
  } | null>(null);
  const columns = customColumns ?? defaultColumns;

  function readCurrentState(): SavedViewState {
    return toSavedViewState({
      ...conditions,
      columns,
      chartPanels: activeView ? viewChartPanels : readStoredChartPanelLayout(projectId, 'runList'),
    });
  }
  const isChanged = activeView ? hasUnsavedChanges(activeView.state, readCurrentState()) : false;
  // ビューを開いている間、図はこのブラウザに保存した配置ではなく、ビューの配置を編集する。
  const chartLayoutSource = useMemo<ChartPanelLayoutSource | null>(
    () => (activeView ? { layout: viewChartPanels, onChange: setViewChartPanels } : null),
    [activeView, viewChartPanels],
  );

  /** ビューの列と図を出す。条件をURLに入れるのは呼び出し側。 */
  function showView(view: SavedView, state: SavedViewState) {
    const display = toRunListDisplay(state);
    setCustomColumns(display.columns.length ? display.columns : null);
    setViewChartPanels(display.chartPanels);
    setActiveView(view);
  }
  function applyView(view: SavedView, state: SavedViewState) {
    showView(view, state);
    setParams(runListParamsForView(view.id, toRunListDisplay(state)), { replace: true });
  }
  function leaveView() {
    setActiveView(null);
    setCustomColumns(null);
    setViewChartPanels(null);
  }
  // レンダリング中にURLに従う。新しく読み込んだビューは1回だけ出し、開けないビューはお知らせを
  // 出して既定の表示に戻し、`?view=`が消えたら（戻るボタン）ビューを離れる。
  const isWaitingForSavedUrl = savedViewId !== null && viewId !== savedViewId;
  if (savedViewId !== null && viewId === savedViewId) setSavedViewId(null);
  if (!isWaitingForSavedUrl) {
    if (opened.status === 'ready' && activeView?.id !== opened.view.id) {
      setNoticeReason(null);
      showView(opened.view, opened.state);
      setViewOpenedFromUrl({ view: opened.view, state: opened.state });
    } else if (
      opened.status === 'unavailable' &&
      (noticeReason !== opened.reason || activeView || customColumns || viewChartPanels)
    ) {
      setNoticeReason(opened.reason);
      leaveView();
    } else if (opened.status === 'none' && activeView) {
      leaveView();
    }
  }
  // URLはレンダリングの後で書く。ルーターのsetterはレンダリング中には呼べない。setterはURLが
  // 変わるたびに変わるので、依存に入れずにEffect Eventを通して読む。
  const replaceUrl = useEffectEvent((next: URLSearchParams) => setParams(next, { replace: true }));
  useEffect(() => {
    if (viewOpenedFromUrl)
      replaceUrl(runListParamsForView(viewOpenedFromUrl.view.id, toRunListDisplay(viewOpenedFromUrl.state)));
  }, [viewOpenedFromUrl]);
  const isOpenedViewUnavailable = opened.status === 'unavailable';
  useEffect(() => {
    if (isOpenedViewUnavailable) replaceUrl(new URLSearchParams());
  }, [isOpenedViewUnavailable]);

  /** ビューを開く。nullなら既定の表示を開く。開いているビューをもう一度開くと、その変更を捨てる。 */
  function openView(id: string | null) {
    setNoticeReason(null);
    if (id && id === activeView?.id) {
      applyView(activeView, activeView.state);
      return;
    }
    setParams(id ? { [RUN_LIST_PARAMS.view]: id } : {});
  }
  /** 保存・名前の変更・［名前を付けて保存］の後。一覧は今の表示を、保存したビューのものとして保つ。 */
  function finishSave(view: SavedView) {
    if (!activeView) {
      // 既定の表示から保存した。動く既定値ではなく、保存した内容をそのまま保つ。
      setCustomColumns(columns);
      setViewChartPanels(toRunListDisplay(view.state).chartPanels);
    }
    setActiveView(view);
    setSavedViewId(view.id);
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(RUN_LIST_PARAMS.view, view.id);
      return next;
    });
  }

  return {
    views,
    openError: opened.status === 'error' ? opened.message : null,
    activeView,
    notice: noticeReason ? unavailableViewNotice[noticeReason] : null,
    columns,
    setColumns: setCustomColumns,
    isChanged,
    chartLayoutSource,
    readCurrentState,
    openView,
    finishSave,
  };
}
