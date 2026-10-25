import { useId, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { Artifact } from '@mmt/contracts';
import { useLocation } from 'react-router-dom';
import { usePopover } from '@mado/design-system/react';
import { artifactLifecycleApi } from '../api/artifactLifecycle';
import { ConfirmDialog } from './ConfirmDialog';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';

/**
 * 開いているArtifactの⋯メニュー。削除は元に戻せないので、常に見えるボタンにせずここに置き、
 * 必ず先に確かめる。何かが使っているファイルは削除できないので、確認の後で失敗させるのでなく、
 * 理由を添えて項目を無効にする。Project adminにだけ表示する。
 */
export function ArtifactActionsMenu({
  artifact,
  isReferenced,
  onDeleted,
}: {
  artifact: Artifact;
  /** 参照を読み込んでいる間はnull。どちらにしても、参照されているファイルはサーバーが断る。 */
  isReferenced: boolean | null;
  onDeleted: () => void;
}) {
  useLocale();
  const menuId = useId();
  const reasonId = useId();
  const { pathname } = useLocation();
  const { container: popoverContainer, isOpen, toggle, close } = usePopover({ closeKey: pathname });
  const [isConfirming, setIsConfirming] = useState(false);
  return (
    <div className="artifact-actions" ref={popoverContainer}>
      <button
        type="button"
        className="icon-button"
        aria-label={text.artifactActions}
        title={text.artifactActions}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={toggle}
      >
        <MoreHorizontal size={17} />
      </button>
      {isOpen && (
        <div className="popover menu artifact-actions-popover" id={menuId} role="menu">
          <button
            type="button"
            role="menuitem"
            className="menu-item danger"
            disabled={isReferenced === true}
            aria-describedby={isReferenced ? reasonId : undefined}
            onClick={() => {
              close();
              setIsConfirming(true);
            }}
          >
            {text.artifactDelete}
          </button>
          {isReferenced && (
            <p className="artifact-actions-reason" id={reasonId}>
              {text.artifactDeleteBlockedByReferences}
            </p>
          )}
        </div>
      )}
      {isConfirming && (
        <ConfirmDialog
          title={text.artifactDeleteTitle}
          message={textTemplates.artifactDeleteConfirm(artifact.path)}
          confirmLabel={text.artifactDelete}
          destructive
          onConfirm={() => artifactLifecycleApi.delete(artifact.projectId, artifact.id)}
          onConfirmed={() => {
            setIsConfirming(false);
            onDeleted();
          }}
          onClose={() => setIsConfirming(false)}
        />
      )}
    </div>
  );
}
