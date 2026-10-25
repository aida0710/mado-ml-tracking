import { useState } from 'react';
import type { TokenScope } from '@mmt/contracts';
import { TokenDialog } from '../dialogs/TokenDialog';
import { useProject } from '../hooks/useProject';

/**
 * このProjectで使う自分のtokenを発行するダイアログを、案内に要るscopeを選んだ状態で開く。Viewerは
 * 書き込みのscopeを持てず、tokenが断られるので、ボタンを出さない。
 */
export function ProjectTokenButton({
  label,
  scopes,
  onCreated,
}: {
  label: string;
  scopes: readonly TokenScope[];
  onCreated?: () => void;
}) {
  const { project, canEdit } = useProject();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  if (!canEdit) return null;
  return (
    <>
      <button type="button" className="button small" onClick={() => setIsDialogOpen(true)}>
        {label}
      </button>
      {isDialogOpen && (
        <TokenDialog
          project={project}
          initialScopes={scopes}
          onClose={() => setIsDialogOpen(false)}
          onCreated={() => onCreated?.()}
        />
      )}
    </>
  );
}
