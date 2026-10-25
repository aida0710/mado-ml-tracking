import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import type { ComputeTargetDetails } from '@mmt/contracts';
import { useAuth } from '../hooks/useAuth';
import { useComputers } from '../hooks/useComputers';
import { SettingsPageHeader } from '../components/SettingsPageHeader';
import { ComputerOverviewTable } from '../components/ComputerOverviewTable';
import { ComputerDetails } from '../components/ComputerDetails';
import { ErrorNotice, Resource } from '../components/Feedback';
import { TargetDialog } from '../dialogs/TargetDialog';
import { canAddTarget } from '../lib/permissions';
import { COMPUTER_DETAILS_PARAM } from '../layout/settingsSections';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

type TargetDialogState = { mode: 'create' } | { mode: 'edit'; target: ComputeTargetDetails };

/**
 * 全体設定 → コンピュータ（/settings/computers）。誰でも開け、すべてのコンピュータを所有者、
 * 公開範囲、状態つきで並べる。誰でもここでコンピュータを足せて、足したものの所有者になる。
 * 使える・管理できるコンピュータは、一覧の下に詳細を開く。
 */
export function ComputersSettingsPage() {
  useLocale();
  const { user } = useAuth();
  const computers = useComputers();
  const [dialog, setDialog] = useState<TargetDialogState | null>(null);
  // 開いているコンピュータはURLに持つので、ほかの画面からその詳細へリンクできる（computerDetailsPath）。
  const [params, setParams] = useSearchParams();
  const selectedTargetId = params.get(COMPUTER_DETAILS_PARAM);
  const setSelectedTargetId = (targetId: string) =>
    setParams({ [COMPUTER_DETAILS_PARAM]: targetId });
  const selectedTarget = computers.findDetails(selectedTargetId);
  const openEditor = (targetId: string) => {
    const target = computers.findDetails(targetId);
    if (target) setDialog({ mode: 'edit', target });
  };
  return (
    <section className="management-page" data-testid="computers-settings">
      <SettingsPageHeader
        section="computers"
        actions={
          <>
            {canAddTarget(user) && (
              <button className="button primary" onClick={() => setDialog({ mode: 'create' })}>
                <Plus size={15} />
                {text.newTarget}
              </button>
            )}
            <button className="icon-button" aria-label={text.refresh} onClick={computers.reload}>
              <RefreshCw size={17} />
            </button>
          </>
        }
      />
      <p className="muted">{text.computersHint}</p>
      <ErrorNotice message={computers.mutation.error} />
      <Resource query={computers.overview}>
        {(targets) => (
          <ComputerOverviewTable
            targets={targets}
            user={user}
            selectedTargetId={selectedTargetId}
            pending={computers.mutation.pending}
            onOpen={(target) => setSelectedTargetId(target.id)}
            onEdit={(target) => openEditor(target.id)}
            onToggleEnabled={computers.toggleEnabled}
          />
        )}
      </Resource>
      {selectedTarget && (
        <ComputerDetails
          key={selectedTarget.id}
          target={selectedTarget}
          user={user}
          onTargetChanged={computers.reload}
        />
      )}
      {dialog && (
        <TargetDialog
          target={dialog.mode === 'edit' ? dialog.target : undefined}
          onClose={() => {
            setDialog(null);
            // コンピュータを足す1段目（と再確認）は、ダイアログが終わる前に保存する。
            computers.reload();
          }}
          onSaved={(saved) => {
            setDialog(null);
            // 保存したコンピュータは詳細を開く。siteの鍵とjob shellはそこにある。
            setSelectedTargetId(saved.id);
            computers.reload();
          }}
        />
      )}
    </section>
  );
}
