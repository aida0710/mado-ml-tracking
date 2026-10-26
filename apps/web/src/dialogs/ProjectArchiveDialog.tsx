import { useState } from 'react';
import type { Project } from '@mmt/contracts';
import { accessApi } from '../api/access';
import { administrationApi } from '../api/administration';
import { useQuery } from '../hooks/useQuery';
import { countUsableTokens } from '../lib/projectArchiveImpact';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';
import { joinSentences } from '../i18n/textJoining';

/**
 * Projectのアーカイブを確かめる。Projectの設定と全体管理から開く。データが残ることに加えて、
 * 止まるもの、つまりProjectのtoken（動いているworkerのものも含む）と自動実行を伝える。
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
  // ダイアログを開いたときに読む。見せる件数を、クリックで実際に止まる件数と同じにするため。
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
      onConfirm={() => administrationApi.archiveProject(project.id)}
      onConfirmed={onArchived}
      onClose={onClose}
    />
  );
}
