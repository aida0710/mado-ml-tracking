import { PlugZap } from 'lucide-react';
import type { SiteConnectionCheck, SiteConnectionCheckStatus } from '@mmt/contracts';
import { siteComputersApi } from '../api/siteComputers';
import { useMutation } from '../hooks/useMutation';
import { useQueryPolledWhileActive } from '../hooks/useQueryPolledWhileActive';
import { ErrorNotice, Resource } from './Feedback';
import { ResponsiveTable } from './ResponsiveTable';
import { formatDate } from '../lib/format';
import { isConnectionCheckInProgress } from '../lib/siteComputerDisplay';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { siteConnectionCheckStatusLabels } from '../i18n/siteComputers';

// Jobの状態の色を使い回す。成功は緑、失敗は赤、待っている確認は中立の色。
const checkBadgeClass: Record<SiteConnectionCheckStatus, string> = {
  queued: 'status-neutral',
  succeeded: 'status-success',
  failed: 'status-danger',
};

/**
 * 鍵とアカウント（自分のもの、または共有アカウントのもの）で1回ログインするようランチャーに頼み、
 * 最新の結果を並べる。最新の結果がランチャーを待っている間はポーリングする。確認にはランチャーが
 * 作った鍵が要るので、その鍵ができるのを待つ。
 */
export function SiteConnectionChecks({
  targetId,
  personal,
  userId,
  isKeyReady,
}: {
  targetId: string;
  personal: boolean;
  userId: string;
  /** ランチャーがアカウントの鍵を作った。それまではAPIが確認を断る。 */
  isKeyReady: boolean;
}) {
  useLocale();
  const mutation = useMutation();
  // 全体管理者にはほかの人の確認も届くことがあるので、このアカウントのものだけを表示する。
  const accountChecks = (checks: SiteConnectionCheck[]) =>
    checks.filter((check) => check.userId === (personal ? userId : null));
  const checks = useQueryPolledWhileActive(
    `site-connection-checks:${targetId}:${personal}`,
    (signal) => siteComputersApi.connectionChecks(targetId, personal, signal),
    (items) => isConnectionCheckInProgress(accountChecks(items)),
  );
  const isInProgress = isConnectionCheckInProgress(accountChecks(checks.value ?? []));
  const requestCheck = () =>
    void mutation
      .run(() => siteComputersApi.requestConnectionCheck(targetId, { personal }))
      .then((created) => {
        if (created) checks.reload();
      });
  return (
    <div className="site-connection-checks">
      <p className="muted">{text.siteConnectionCheckHint}</p>
      <div className="site-computer-actions">
        <button
          type="button"
          className="button small"
          disabled={mutation.pending || isInProgress || !isKeyReady}
          onClick={requestCheck}
        >
          <PlugZap size={14} />
          {text.checkTarget}
        </button>
      </div>
      <ErrorNotice message={mutation.error} />
      <Resource query={checks}>
        {(items) => <SiteConnectionCheckList checks={accountChecks(items)} />}
      </Resource>
    </div>
  );
}

export function SiteConnectionCheckList({ checks }: { checks: SiteConnectionCheck[] }) {
  useLocale();
  return (
    <ResponsiveTable
      rows={checks}
      rowKey={(check) => check.id}
      label={text.siteConnectionChecks}
      empty={text.siteConnectionCheckNone}
      columns={[
        {
          key: 'status',
          priority: 'primary',
          header: text.status,
          render: (check) => (
            <span className={`status-badge ${checkBadgeClass[check.status]}`}>
              <span aria-hidden="true">●</span>
              {siteConnectionCheckStatusLabels[check.status]}
            </span>
          ),
        },
        {
          key: 'message',
          priority: 'primary',
          header: text.siteConnectionCheckMessage,
          className: 'mono',
          render: (check) => check.message ?? '—',
        },
        {
          key: 'requested',
          priority: 'secondary',
          header: text.targetCheckRequestedAt,
          render: (check) => formatDate(check.createdAt),
        },
        {
          key: 'finished',
          priority: 'secondary',
          header: text.targetCheckFinishedAt,
          render: (check) => formatDate(check.finishedAt),
        },
      ]}
    />
  );
}
