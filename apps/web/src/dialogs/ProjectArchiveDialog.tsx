import { useState } from 'react';
import type { Project } from '@mmt/contracts';
import { accessApi } from '../api/access';
import { administrationApi } from '../api/administration';
import { useQuery } from '../hooks/useQuery';
import { countUsableTokens } from '../lib/projectArchiveImpact';
import { explainProjectLifecycleConflict } from '../lib/projectLifecycleConflict';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';
import { joinSentences } from '../i18n/textJoining';

/**
 * Confirms archiving a Project, from its settings or from 全体管理. Besides that the data stays,
 * it says what stops: the Project's tokens (a running worker's among them) and its automation.
 */
export function ProjectArchiveDialog({
  project,
  onArchived,
  onClose,
}: {
  project: Pick<Project, 'id' | 'name'>;
  onArchived: () => void;
  onClose: () => void;
}) {
  useLocale();
  // Read when the dialog opens, so the count is the one the click acts on.
  const tokens = useQuery({ key: `${project.id}:archive-tokens`, load: (signal) =>
    accessApi.projectTokens(project.id, signal),
  });
  const [openedAt] = useState(() => Date.now());
  const usableTokenCount = tokens.value && countUsableTokens(tokens.value, openedAt);
  const message = joinSentences([
    textTemplates.projectArchiveConfirm(project.name),
    textTemplates.projectArchiveStops(usableTokenCount),
  ]);
  return (
    <ConfirmDialog
      title={text.projectArchiveTitle}
      message={message}
      confirmLabel={text.projectArchive}
      destructive
      onConfirm={() =>
        explainProjectLifecycleConflict(administrationApi.archiveProject(project.id))
      }
      onConfirmed={onArchived}
      onClose={onClose}
    />
  );
}
