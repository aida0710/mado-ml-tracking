import { useState } from 'react';
import { PlugZap } from 'lucide-react';
import type {
  ComputeTarget,
  ExecutionRuntimeKind,
  TargetCheck,
  TargetCheckGpu,
} from '@mmt/contracts';
import { executionApi } from '../api/execution';
import { useMutation } from '../hooks/useMutation';
import { useTargetCheck } from '../hooks/useTargetCheck';
import { CheckboxList } from './CheckboxList';
import { ResponsiveTable } from './ResponsiveTable';
import { ErrorNotice, Resource } from './Feedback';
import { StatusBadge } from './StatusBadge';
import { TargetCheckItemsTable } from './TargetCheckItemsTable';
import { formatBytes, formatDate } from '../lib/format';
import { formatCheckedHost, targetCheckHintFor } from '../lib/computeTargetDisplay';
import { toggleValue } from '../lib/formValues';
import {
  detectedCandidates,
  hasCandidateChanges,
  isCheckInProgress,
  type TargetCandidates,
} from '../lib/targetCheckCandidates';
import { isWorkerMissing, type WorkerCoverage } from '../lib/workerCoverage';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { runtimeLabels } from '../i18n/runtime';
import { workerCoverageText } from '../i18n/workerCoverage';
import { formatList, formatNote } from '../i18n/textJoining';

/**
 * workerが行う、sshかlocalのコンピュータの接続の確認。siteに届くのはそのランチャーだけで、
 * ランチャーはsiteの詳細（SiteComputerDetails）でsiteへのログインを確認する。
 */
export function TargetCheckPanel({
  target,
  checkCoverage,
  onTargetSaved,
}: {
  target: ComputeTarget;
  /** このコンピュータを挙げているworkerがいるか。見ている人がworkerを一覧できなければundefined。 */
  checkCoverage?: WorkerCoverage;
  onTargetSaved: () => void;
}) {
  useLocale();
  const check = useTargetCheck(target.id);
  const { checks, latest } = check;
  // 前回の確認に選ばれたworkerがもう一度確認する。いなければ、担当のworkerが確認する。
  const requestCheck = () => void check.request({ worker: latest?.assignedWorker ?? undefined });
  return (
    <section className="settings-section" data-testid="target-check-panel">
      <div className="section-heading">
        <h2>
          {text.targetCheck}: {target.name}
        </h2>
        <button
          className="button primary"
          disabled={check.pending || check.isInProgress}
          onClick={requestCheck}
        >
          <PlugZap size={15} />
          {text.checkTarget}
        </button>
      </div>
      <p className="muted">{targetCheckHintFor(target.executor)}</p>
      {/* 頼む前に分かる。だれも受け取らない確認は、5分たってようやく失敗になる。 */}
      {checkCoverage && isWorkerMissing(checkCoverage) && !check.isInProgress && (
        <p className="notice error" role="status">
          {workerCoverageText.targetCheckWorkerMissing}
        </p>
      )}
      <ErrorNotice message={check.error} />
      <Resource query={checks}>
        {() =>
          latest ? (
            <TargetCheckDetails check={latest} target={target} onTargetSaved={onTargetSaved} />
          ) : (
            <p className="state-message">{text.targetCheckNone}</p>
          )
        }
      </Resource>
    </section>
  );
}

function TargetCheckDetails({
  check,
  target,
  onTargetSaved,
}: {
  check: TargetCheck;
  target: ComputeTarget;
  onTargetSaved: () => void;
}) {
  useLocale();
  const candidates = detectedCandidates(check);
  return (
    <>
      <dl className="details-list">
        <dt>{text.status}</dt>
        <dd>
          <StatusBadge status={check.status} />
        </dd>
        <dt>{text.targetCheckRequestedAt}</dt>
        <dd>{formatDate(check.createdAt)}</dd>
        {check.finishedAt && (
          <>
            <dt>{text.targetCheckFinishedAt}</dt>
            <dd>{formatDate(check.finishedAt)}</dd>
          </>
        )}
        {check.workerId && (
          <>
            <dt>{text.targetCheckWorker}</dt>
            <dd className="mono">{check.workerId}</dd>
          </>
        )}
        {check.result && (
          <>
            <dt>{text.hostFacts}</dt>
            <dd>{formatCheckedHost(check.result.host)}</dd>
          </>
        )}
        {check.result?.workDirectoryFreeBytes != null && (
          <>
            <dt>{text.targetCheckFreeSpace}</dt>
            <dd>{formatBytes(check.result.workDirectoryFreeBytes)}</dd>
          </>
        )}
      </dl>
      {isCheckInProgress(check) && <p className="notice">{text.targetCheckWaiting}</p>}
      {check.failureReason === 'no_worker' && (
        <p className="notice error">{text.targetCheckNoWorker}</p>
      )}
      {check.failureReason === 'claim_timeout' && (
        <p className="notice error">{text.targetCheckClaimTimeout}</p>
      )}
      {check.result && (
        <TargetCheckItemsTable items={check.result.items} executor={target.executor} />
      )}
      {check.result?.gpus && <DetectedGpus gpus={check.result.gpus} />}
      {candidates && (
        <TargetCandidateEditor
          key={check.id}
          target={target}
          detected={candidates}
          onSaved={onTargetSaved}
        />
      )}
    </>
  );
}

function DetectedGpus({ gpus }: { gpus: TargetCheckGpu[] }) {
  useLocale();
  return (
    <>
      <h3>{text.detectedGpus}</h3>
      <ResponsiveTable
        rows={gpus}
        rowKey={(gpu) => gpu.uuid}
        empty={text.noDetectedGpus}
        columns={[
          {
            key: 'index',
            priority: 'primary',
            header: text.gpuIndex,
            className: 'mono',
            render: (gpu) => gpu.index,
          },
          { key: 'name', priority: 'primary', header: text.name, render: (gpu) => gpu.name },
          {
            key: 'memory',
            priority: 'secondary',
            header: text.gpuMemory,
            className: 'mono',
            render: (gpu) => `${gpu.memoryTotalMiB} MiB`,
          },
          {
            key: 'uuid',
            priority: 'secondary',
            header: text.gpuUuid,
            className: 'mono',
            render: (gpu) => gpu.uuid,
          },
        ]}
      />
    </>
  );
}

// 検出した値は候補に出すだけで、コンピュータの設定は管理者が保存したときに変わる。
function TargetCandidateEditor({
  target,
  detected,
  onSaved,
}: {
  target: ComputeTarget;
  detected: TargetCandidates;
  onSaved: () => void;
}) {
  useLocale();
  const mutation = useMutation();
  const [selected, setSelected] = useState<TargetCandidates>(detected);
  const [isSaved, setSaved] = useState(false);
  const toggle = <K extends keyof TargetCandidates>(field: K, value: TargetCandidates[K][number]) => {
    setSaved(false);
    setSelected((previous) => ({
      ...previous,
      [field]: toggleValue(previous[field] as string[], value),
    }));
  };
  const currentGpus = formatList(target.gpuIds) || text.cpuOnly;
  const currentRuntimes = formatList(target.runtimeKinds.map((kind) => runtimeLabels[kind]));
  const save = () =>
    void mutation
      .run(() =>
        executionApi.updateTarget(target.id, {
          gpuIds: selected.gpuIds,
          runtimeKinds: selected.runtimeKinds,
        }),
      )
      .then((saved) => {
        if (!saved) return;
        setSaved(true);
        onSaved();
      });
  return (
    <div className="target-check-candidates">
      <h3>{text.targetCheckCandidates}</h3>
      <p className="muted">{text.targetCheckCandidatesHint}</p>
      <ErrorNotice message={mutation.error} />
      <CheckboxList
        legend={`${text.gpuIds}${formatNote(`${text.targetCheckCurrent}: ${currentGpus}`)}`}
        options={detected.gpuIds.map((gpuId) => ({ value: gpuId, label: gpuId }))}
        selected={selected.gpuIds}
        onToggle={(gpuId) => toggle('gpuIds', gpuId)}
        empty={text.noDetectedGpus}
      />
      <CheckboxList
        legend={`${text.runtimeKinds}${formatNote(`${text.targetCheckCurrent}: ${currentRuntimes}`)}`}
        options={detected.runtimeKinds.map((kind) => ({ value: kind, label: runtimeLabels[kind] }))}
        selected={selected.runtimeKinds}
        onToggle={(kind) => toggle('runtimeKinds', kind as ExecutionRuntimeKind)}
      />
      <button
        className="button"
        disabled={
          mutation.pending ||
          selected.runtimeKinds.length === 0 ||
          !hasCandidateChanges(target, selected)
        }
        onClick={save}
      >
        {text.saveTargetCandidates}
      </button>
      {isSaved && (
        <p className="notice success" role="status">
          {text.targetCheckCandidatesSaved}
        </p>
      )}
    </div>
  );
}
