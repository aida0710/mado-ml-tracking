import type { ReactNode } from 'react';
import type { ComputeTargetDetails, User } from '@mmt/contracts';
import { ComputeTargetKind } from './ComputeTargetKind';
import { CopyableValue } from './CopyableValue';
import { DetailsList } from './JsonDetails';
import { SiteComputerDetails } from './SiteComputerDetails';
import { TargetCheckPanel } from './TargetCheckPanel';
import { WorkerSetupGuide } from './WorkerSetupGuide';
import { WorkerCoverageBadge } from './WorkerCoverage';
import { useAllWorkers } from '../hooks/useAllWorkers';
import { formatTargetGpus, formatTargetLocation } from '../lib/computeTargetDisplay';
import { canManageTarget, isGlobalAdmin } from '../lib/permissions';
import { checkWorkerCoverage, jobWorkerCoverage } from '../lib/workerCoverage';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';
import { runtimeLabels } from '../i18n/runtime';
import { workerCoverageText } from '../i18n/workerCoverage';
import { formatList } from '../i18n/textJoining';

/**
 * 全体設定 → コンピュータの下に出す、コンピュータの詳細。使える人と管理できる人に向ける。siteなら
 * job shell、設定、投入。sshかlocalならIDを含む概要。コンピュータの設定は所有者と全体管理者が
 * 行うので、接続の確認と、そのJobを受け取るworkerの動かし方はその人たちにだけ出す。ほかの人には、
 * だれがworkerを設定するかを伝える。
 */
export function ComputerDetails({
  target,
  user,
  onTargetChanged,
}: {
  target: ComputeTargetDetails;
  user: Pick<User, 'id' | 'isAdmin'>;
  onTargetChanged: () => void;
}) {
  useLocale();
  // すべてのProjectのworkerを一覧できるのは全体管理者だけ。ほかの人には、
  // だれがworkerを動かすかを示す。
  const workers = useAllWorkers(target.executor !== 'site' && isGlobalAdmin(user));
  if (target.executor === 'site')
    return <SiteComputerDetails target={target} user={user} onTargetChanged={onTargetChanged} />;
  const canManage = canManageTarget(user, target);
  // 全Projectのworkerが対象。どれかが応答しても、このProjectのJobが始まるとは限らない。
  const workerEntry: Array<[string, ReactNode]> = workers.value
    ? [
        [
          workerCoverageText.workerCoverageAnyProject,
          <>
            <WorkerCoverageBadge coverage={jobWorkerCoverage(target, workers.value)} />{' '}
            <span className="muted">{workerCoverageText.workerCoverageAnyProjectHint}</span>
          </>,
        ],
      ]
    : [];
  // コンピュータを管理できない人には、workerの設定の代わりに、だれが設定するかを示す。
  const workerSetUpByEntry: Array<[string, ReactNode]> = canManage
    ? []
    : [
        [
          text.workerSetupTitle,
          <span data-testid="worker-set-up-by">
            {textTemplates.workerSetUpBy(target.ownerName ?? target.ownerUserId)}
          </span>,
        ],
      ];
  return (
    <>
      <section className="settings-section" data-testid="computer-summary">
        <div className="section-heading">
          <h2>{target.name}</h2>
        </div>
        <DetailsList
          entries={[
            [text.computerId, <CopyableValue value={target.id} />],
            [text.computerKind, <ComputeTargetKind target={target} />],
            [text.computerLocation, <span className="mono">{formatTargetLocation(target)}</span>],
            [text.runtimeKinds, formatList(target.runtimeKinds.map((kind) => runtimeLabels[kind]))],
            [text.gpuIds, formatTargetGpus(target)],
            [text.maxConcurrentJobs, String(target.maxConcurrentJobs)],
            ...workerEntry,
            ...workerSetUpByEntry,
          ]}
        />
      </section>
      {canManage && (
        <>
          <TargetCheckPanel
            target={target}
            checkCoverage={workers.value && checkWorkerCoverage(target, workers.value)}
            onTargetSaved={onTargetChanged}
          />
          <WorkerSetupGuide targetId={target.id} />
        </>
      )}
    </>
  );
}
