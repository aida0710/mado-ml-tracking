import { useState } from 'react';
import type { TokenScope } from '@mmt/contracts';
import { TokenDialog } from '../dialogs/TokenDialog';
import { useProject } from '../hooks/useProject';

/**
 * Opens the dialog that issues one's own token for this Project, with the scopes a guide needs
 * already selected. Viewers cannot hold write scopes, so the token would be refused and they get
 * no button.
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
