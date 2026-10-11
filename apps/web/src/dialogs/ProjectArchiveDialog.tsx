import { useLocale } from '../i18n/useLocale';
import type { Project } from '@mmt/contracts';
import { accessApi } from '../api/access';
import { administrationApi } from '../api/administration';
import { useQuery } from '../hooks/useQuery';
import { countUsableTokens } from '../lib/projectArchiveImpact';
import { explainProjectLifecycleConflict } from '../lib/projectLifecycleConflict';
import { ConfirmDialog } from '../components/ConfirmDialog';
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
  const tokens = useQuery(`${project.id}:archive-tokens`, (signal) =>
    accessApi.projectTokens(project.id, signal),
  );
  const usableTokenCount = tokens.value && countUsableTokens(tokens.value, Date.now());
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
