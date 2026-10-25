import { Link } from 'react-router-dom';
import { computerDetailsPath } from '../layout/settingsSections';
import { formatDateTimeSeconds } from '../lib/format';
import type { WorkerCoverage } from '../lib/workerCoverage';
import { workerCoverageLabel } from '../lib/workerCoverageDisplay';
import { useLocale } from '../i18n/useLocale';
import { workerCoverageText, workerCoverageTextTemplates } from '../i18n/workerCoverage';
import { joinSentences } from '../i18n/textJoining';

// オンラインはJobの緑のバッジ、workerがいないときは赤のバッジ。siteにworkerは要らない。
const coverageBadgeClass: Record<WorkerCoverage['state'], string> = {
  online: 'status-success',
  offline: 'status-danger',
  none: 'status-danger',
  notNeeded: 'status-neutral',
};

/** 一覧に出すコンピュータのworkerの状態。応答が途絶えたworkerには最後の応答を添える。 */
export function WorkerCoverageBadge({ coverage }: { coverage: WorkerCoverage }) {
  useLocale();
  return (
    <span className="badge-group">
      <span className={`status-badge ${coverageBadgeClass[coverage.state]}`}>
        {workerCoverageLabel(coverage)}
      </span>
      {coverage.state === 'offline' && (
        <small className="muted">
          {workerCoverageTextTemplates.workerCoverageOfflineSince(
            formatDateTimeSeconds(coverage.lastSeenAt),
          )}
        </small>
      )}
    </span>
  );
}

/**
 * コンピュータで処理が始まらない理由。どのworkerも引き受けないか、workerの応答が途絶えている。
 * `consequence`は、表示する場所でそれが何を意味するか（待っているJob、起動、Sweep）を書く。
 * リンクはコンピュータの詳細を開く。そこで管理者はworkerの動かし方を、ほかの人は誰が動かして
 * いるかを読める。
 */
export function WorkerMissingNotice({
  target,
  coverage,
  consequence,
}: {
  target: { id: string; name: string };
  coverage: WorkerCoverage;
  consequence: string;
}) {
  useLocale();
  if (coverage.state !== 'none' && coverage.state !== 'offline') return null;
  return (
    <div className="notice error worker-missing" role="status">
      <p>
        {joinSentences([
          coverage.state === 'none'
            ? workerCoverageTextTemplates.targetWorkerNone(target.name)
            : workerCoverageTextTemplates.targetWorkerOffline(target.name, formatDateTimeSeconds(coverage.lastSeenAt)),
          consequence,
        ])}
      </p>
      <p>
        <Link to={computerDetailsPath(target.id)}>{workerCoverageText.workerCoverageSetupLink}</Link>
        <span className="muted"> {workerCoverageText.workerCoverageSetupByOwner}</span>
      </p>
    </div>
  );
}
