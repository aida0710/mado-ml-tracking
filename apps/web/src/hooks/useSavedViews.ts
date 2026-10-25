import type { SavedView, SavedViewPage, SavedViewState } from '@mmt/contracts';
import { savedViewsApi } from '../api/savedViews';
import { isNotFoundError } from '../api/http';
import { parseSavedViewState } from '../lib/savedViewState';
import { useQuery } from './useQuery';

/** URLのビューを出せない理由。そのときの一覧は既定の表示で開く。 */
export type SavedViewUnavailableReason = 'not_found' | 'unsupported_version' | 'invalid';

export type OpenedSavedView =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; view: SavedView; state: SavedViewState }
  | { status: 'unavailable'; reason: SavedViewUnavailableReason }
  | { status: 'error'; message: string };

type OpenResult = Exclude<OpenedSavedView, { status: 'none' | 'loading' | 'error' }>;

async function openSavedView(
  projectId: string,
  viewId: string,
  signal: AbortSignal,
): Promise<OpenResult> {
  try {
    const view = await savedViewsApi.get(projectId, viewId, signal);
    const parsed = parseSavedViewState(view.state);
    return parsed.ok
      ? { status: 'ready', view, state: parsed.state }
      : { status: 'unavailable', reason: parsed.reason };
  } catch (failure) {
    // ほかの人の「自分だけ」のビューは、削除されたビューと同じく404を返すので、両者は同じ扱いになる。
    if (isNotFoundError(failure))
      return { status: 'unavailable', reason: 'not_found' };
    throw failure;
  }
}

/** ページに出すビューの一覧と、URLで指定したビュー（`viewId`。無ければ空）。 */
export function useSavedViews(projectId: string, page: SavedViewPage, viewId: string) {
  const views = useQuery({ key: `${projectId}:saved-views:${page}`, load: (signal) =>
    savedViewsApi.list(projectId, page, signal),
  });
  const openQuery = useQuery({ key: viewId ? `${projectId}:saved-view:${viewId}` : null, load: (signal) =>
    openSavedView(projectId, viewId, signal),
  });
  const opened: OpenedSavedView = !viewId
    ? { status: 'none' }
    : openQuery.error
      ? { status: 'error', message: openQuery.error }
      : (openQuery.value ?? { status: 'loading' });
  return { views, opened, reloadOpened: openQuery.reload };
}
