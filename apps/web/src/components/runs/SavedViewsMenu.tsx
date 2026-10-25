import { useRef, useState } from 'react';
import { Bookmark, Check, Link2, Pencil, Save, Trash2 } from 'lucide-react';
import type { SavedView, SavedViewState } from '@mmt/contracts';
import { savedViewsApi } from '../../api/savedViews';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorNotice } from '../Feedback';
import { SaveViewDialog } from './SaveViewDialog';
import { useCopyFeedback } from '../../hooks/useCopyFeedback';
import { useMutation } from '../../hooks/useMutation';
import type { QueryState } from '../../hooks/useQuery';
import {
  canChangeSavedView,
  canChangeSavedViewVisibility,
  canDeleteSavedView,
  savedViewVisibilityChoices,
  type SavedViewActor,
} from '../../lib/savedViewPermissions';
import { detailsPopoverHandlers } from '../../lib/detailsPopover';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

type MenuDialog = 'saveAs' | 'rename' | 'delete' | null;

/**
 * Runの一覧の保存ビュー。開く、出ている一覧で上書きするか新しい名前で保存する、名前を変える、
 * 削除する、URLをコピーする。何が「出ている一覧」かはページが決める（`readCurrentState`）。
 */
export function SavedViewsMenu({
  projectId,
  actor,
  views,
  activeView,
  hasUnsavedChanges,
  readCurrentState,
  viewUrl,
  onOpen,
  onSaved,
  onDeleted,
}: {
  projectId: string;
  actor: SavedViewActor;
  views: QueryState<SavedView[]>;
  activeView: SavedView | null;
  hasUnsavedChanges: boolean;
  readCurrentState: () => SavedViewState;
  viewUrl: (viewId: string) => string;
  /** nullなら既定の表示を開く。 */
  onOpen: (viewId: string | null) => void;
  onSaved: (view: SavedView) => void;
  onDeleted: (view: SavedView) => void;
}) {
  useLocale();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [dialog, setDialog] = useState<MenuDialog>(null);
  const urlCopy = useCopyFeedback();
  const mutation = useMutation();
  const items = views.value ?? [];
  const groups = [
    { label: text.savedViewPrivateGroup, items: items.filter((view) => view.visibility === 'private') },
    { label: text.savedViewProjectGroup, items: items.filter((view) => view.visibility === 'project') },
  ].filter((group) => group.items.length);

  function open(viewId: string | null) {
    if (menuRef.current) menuRef.current.open = false;
    onOpen(viewId);
  }
  async function overwrite(view: SavedView) {
    const saved = await mutation.run(() =>
      savedViewsApi.update(projectId, view.id, { state: readCurrentState() }),
    );
    if (saved) finishSave(saved);
  }
  function finishSave(saved: SavedView) {
    setDialog(null);
    views.reload();
    onSaved(saved);
  }

  const canChange = activeView ? canChangeSavedView(activeView, actor) : false;
  return (
    <div className="saved-views-bar">
      <details className="saved-views-menu" ref={menuRef} {...detailsPopoverHandlers}>
        <summary>
          <Bookmark size={14} />
          {activeView ? textTemplates.savedViewCurrent(activeView.name) : text.savedViewDefault}
        </summary>
        <div className="popover menu" role="menu" aria-label={text.savedViews}>
          <button
            type="button"
            role="menuitemradio"
            className="menu-item"
            aria-checked={!activeView}
            onClick={() => open(null)}
          >
            {!activeView && <Check size={15} aria-hidden="true" />}
            {text.savedViewDefault}
          </button>
          <ErrorNotice message={views.error} retry={views.reload} />
          {views.value && !items.length && <p className="muted">{text.savedViewNone}</p>}
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <small>{group.label}</small>
              {group.items.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  role="menuitemradio"
                  className="menu-item"
                  aria-checked={activeView?.id === view.id}
                  onClick={() => open(view.id)}
                >
                  {activeView?.id === view.id && <Check size={15} aria-hidden="true" />}
                  {view.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      </details>
      {activeView?.visibility === 'project' && (
        <span className="status-badge status-accent">{text.savedViewShared}</span>
      )}
      {activeView && hasUnsavedChanges && (
        <span className="saved-view-unsaved" role="status">
          {text.savedViewUnsaved}
        </span>
      )}
      {activeView && canChange && hasUnsavedChanges && (
        <button
          type="button"
          className="button small"
          disabled={mutation.pending}
          onClick={() => void overwrite(activeView)}
        >
          <Save size={13} />
          {text.savedViewSave}
        </button>
      )}
      <button type="button" className="button small" onClick={() => setDialog('saveAs')}>
        {text.savedViewSaveAs}
      </button>
      {activeView && (
        <>
          <button type="button" className="button small" onClick={() => void urlCopy.copy(viewUrl(activeView.id))}>
            <Link2 size={13} />
            {urlCopy.copied === null
              ? text.savedViewCopyUrl
              : urlCopy.copied
                ? text.savedViewUrlCopied
                : text.copyFailed}
          </button>
          {canChange && (
            <button type="button" className="button small" onClick={() => setDialog('rename')}>
              <Pencil size={13} />
              {text.savedViewRename}
            </button>
          )}
          {canDeleteSavedView(activeView, actor) && (
            <button type="button" className="button small" onClick={() => setDialog('delete')}>
              <Trash2 size={13} />
              {text.savedViewDelete}
            </button>
          )}
        </>
      )}
      <ErrorNotice message={mutation.error} />
      {dialog === 'saveAs' && (
        <SaveViewDialog
          title={text.savedViewSaveAs}
          initialName=""
          initialVisibility="private"
          visibilityChoices={savedViewVisibilityChoices(actor.role)}
          onSubmit={({ name, visibility }) =>
            savedViewsApi.create(projectId, { page: 'runs', name, visibility, state: readCurrentState() })
          }
          onSaved={finishSave}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'rename' && activeView && (
        <SaveViewDialog
          title={text.savedViewRename}
          initialName={activeView.name}
          initialVisibility={activeView.visibility}
          visibilityChoices={
            canChangeSavedViewVisibility(activeView, actor)
              ? savedViewVisibilityChoices(actor.role)
              : []
          }
          onSubmit={({ name, visibility }) =>
            savedViewsApi.update(projectId, activeView.id, {
              name,
              ...(visibility === activeView.visibility ? {} : { visibility }),
            })
          }
          onSaved={finishSave}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'delete' && activeView && (
        <ConfirmDialog
          title={text.savedViewDeleteTitle}
          message={textTemplates.savedViewDeleteMessage(activeView.name)}
          confirmLabel={text.savedViewDelete}
          destructive
          onConfirm={() => savedViewsApi.remove(projectId, activeView.id)}
          onConfirmed={() => {
            setDialog(null);
            views.reload();
            onDeleted(activeView);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
