import type { ComputeTargetOverview, User } from '@mmt/contracts';
import { ResponsiveTable } from './ResponsiveTable';
import { ComputeTargetKind } from './ComputeTargetKind';
import { ComputeTargetState } from './ComputeTargetState';
import { VisibilityLabel } from './VisibilityLabel';
import { canOpenTargetDetails, launcherStatusLabel } from '../lib/computeTargetOverview';
import { targetOwnerLabel } from '../lib/siteComputerDisplay';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 全体設定 → コンピュータに並ぶすべてのコンピュータ。使えるか管理できる行は詳細を開ける。所有者と
 * 全体管理者は、編集、有効と無効の切り替え、sshかlocalのものの確認もできる。ほかの人の非公開の
 * コンピュータは、名前、種類、所有者、公開範囲、状態だけを表示する。
 */
export function ComputerOverviewTable({
  targets,
  user,
  selectedTargetId,
  pending,
  onOpen,
  onEdit,
  onToggleEnabled,
}: {
  targets: ComputeTargetOverview[];
  user: Pick<User, 'id'>;
  selectedTargetId: string | null;
  /** 変更を保存している途中。スイッチは保存が終わるまで待つ。 */
  pending: boolean;
  /** 一覧の下に詳細を開く。siteなら詳細、sshかlocalなら確認。 */
  onOpen: (target: ComputeTargetOverview) => void;
  onEdit: (target: ComputeTargetOverview) => void;
  onToggleEnabled: (target: ComputeTargetOverview) => void;
}) {
  useLocale();
  return (
    <ResponsiveTable
      rows={targets}
      rowKey={(target) => target.id}
      selectedKey={selectedTargetId ?? undefined}
      empty={text.noComputers}
      columns={[
        {
          key: 'name',
          priority: 'primary',
          header: text.name,
          render: (target) =>
            canOpenTargetDetails(target) ? (
              <button
                className="link-button"
                data-testid={`target-details-${target.id}`}
                onClick={() => onOpen(target)}
              >
                {target.name}
              </button>
            ) : (
              target.name
            ),
        },
        {
          key: 'kind',
          priority: 'secondary',
          header: text.computerKind,
          render: (target) => <ComputeTargetKind target={target} />,
        },
        {
          key: 'owner',
          priority: 'secondary',
          header: text.computerOwner,
          render: (target) => targetOwnerLabel(target, user.id),
        },
        {
          key: 'visibility',
          priority: 'secondary',
          header: text.computerVisibility,
          render: (target) => <VisibilityLabel visibility={target.visibility} />,
        },
        {
          key: 'state',
          priority: 'secondary',
          header: text.status,
          render: (target) => (
            <ComputeTargetState
              enabled={target.enabled}
              launcherStatus={launcherStatusLabel(target)}
            />
          ),
        },
        // スマートフォンでは、行にそのコンピュータを使えるかを出す。公開範囲は詳細に入る。
        {
          key: 'usable',
          priority: 'primary',
          header: text.computerUsable,
          render: (target) => (target.usable ? text.computerUsableYes : text.computerUsableNo),
        },
        ...(targets.some((target) => target.canManage)
          ? [
              {
                key: 'actions',
                priority: 'secondary' as const,
                header: text.actions,
                render: (target: ComputeTargetOverview) =>
                  target.canManage && (
                    <div className="access-actions">
                      <button
                        className="button small"
                        data-testid={`target-edit-${target.id}`}
                        onClick={() => onEdit(target)}
                      >
                        {text.editTarget}
                      </button>
                      <button
                        className="button small"
                        data-testid={`target-toggle-${target.id}`}
                        disabled={pending}
                        onClick={() => onToggleEnabled(target)}
                      >
                        {target.enabled ? text.computerDisable : text.computerEnable}
                      </button>
                      {/* siteのランチャーは、代わりにsiteの詳細でログインを確認する。 */}
                      {target.executor !== 'site' && (
                        <button
                          className="button small"
                          data-testid={`target-check-${target.id}`}
                          onClick={() => onOpen(target)}
                        >
                          {text.checkTargetOpen}
                        </button>
                      )}
                    </div>
                  ),
              },
            ]
          : []),
      ]}
    />
  );
}
