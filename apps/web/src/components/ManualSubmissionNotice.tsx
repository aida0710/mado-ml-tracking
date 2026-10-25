import type { ReactNode } from 'react';
import { CopyableValue } from './CopyableValue';
import { SubmitCliSetup } from './SubmitCliSetup';
import {
  manualSubmitCommand,
  OWNER_SUBMIT_OPTIONS,
  type ManualSiteOwnership,
  type ManualSubmissionGroup,
  type ManualSubmitOptions,
} from '../lib/manualSubmission';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { jobsTextTemplates } from '../i18n/jobs';
import { siteComputersTextTemplates } from '../i18n/siteComputers';

/** 1つの手動のsiteのコマンドと、それをコピーするボタン。 */
export function ManualSubmitCommand({
  targetId,
  options,
}: {
  targetId: string;
  options?: ManualSubmitOptions;
}) {
  useLocale();
  return <CopyableValue value={manualSubmitCommand(targetId, options)} />;
}

/**
 * 手動のsiteのコマンドの下で、所有者について伝えること。自分のコンピュータなら、`--all`がどのJobを
 * 受け取るか。ほかの人のものなら、所有者が`--watch --all`で待ち受けている場所（所有者のPCなど）では
 * 所有者がJobを投入すること。全体のsiteには触れるべき所有者がいない。
 */
function ManualSiteOwnerNote({ ownership }: { ownership: ManualSiteOwnership }) {
  useLocale();
  if (ownership.kind === 'own') return <p className="muted">{text.manualGuideAllScope}</p>;
  if (ownership.kind === 'someoneElse')
    return (
      <p className="muted">{siteComputersTextTemplates.manualGuideOwnerSubmits(ownership.ownerName)}</p>
    );
  return null;
}

/**
 * 手動のsiteで待っているJobがどう投入されるかを、見ている人に伝える。依頼した人がそれぞれ自分の
 * アカウントでコマンドを実行する。コンピュータの所有者は全員の分も受け取れ、受け取るJobの
 * Projectごとに1つずつ待ち受ける（`--watch --all`）。
 */
export function WaitingJobSubmission({
  targetId,
  ownership,
}: {
  targetId: string;
  ownership: ManualSiteOwnership;
}) {
  useLocale();
  return (
    <>
      <ManualSubmitCommand targetId={targetId} />
      {ownership.kind === 'own' && (
        <>
          <p className="muted manual-submit-owner">{text.manualGuideAll}</p>
          <ManualSubmitCommand targetId={targetId} options={OWNER_SUBMIT_OPTIONS} />
        </>
      )}
      <ManualSiteOwnerNote ownership={ownership} />
    </>
  );
}

/** 選んだJobが`mado-tracking submit`を待っている間の案内。 */
export function WaitingJobNotice({
  targetId,
  ownership,
  isRequester,
  tokenButton,
}: {
  targetId: string;
  ownership: ManualSiteOwnership;
  /** 見ている人がJobのRunを作った。 */
  isRequester: boolean;
  /** `mado-tracking submit`に要るtokenを発行する。Projectを開いているときに渡す。 */
  tokenButton?: ReactNode;
}) {
  useLocale();
  return (
    <div className="notice manual-submission">
      <p>{isRequester ? text.manualSubmissionOwnHint : text.manualSubmissionHint}</p>
      <WaitingJobSubmission targetId={targetId} ownership={ownership} />
      <SubmitCliSetup tokenButton={tokenButton} />
    </div>
  );
}

/**
 * 手動のsiteで起動する前に伝える文。Jobは依頼した人の`mado-tracking submit`を待つので、
 * 確認の段階でコマンドとその準備を先に見せる。
 */
export function LaunchManualSubmissionNotice({ targetId }: { targetId: string }) {
  useLocale();
  return (
    <div className="notice manual-submission">
      <p>{text.launchManualSubmissionNotice}</p>
      <ManualSubmitCommand targetId={targetId} />
      <SubmitCliSetup />
    </div>
  );
}

/**
 * 手動のsiteのJobは、依頼した人がsiteで`mado-tracking submit`を実行するまで待つ。
 * mado ML Trackingが自分で投入することはできないので、Jobsの画面の一覧の上でそう伝える。
 */
export function ManualSubmissionNotice({
  groups,
  tokenButton,
}: {
  groups: ManualSubmissionGroup[];
  /** `mado-tracking submit`に要るtokenを発行する。Projectを開いているときに渡す。 */
  tokenButton?: ReactNode;
}) {
  useLocale();
  if (!groups.length) return null;
  return (
    <section className="notice manual-submission" aria-label={text.manualSubmissionTitle}>
      <strong>{text.manualSubmissionTitle}</strong>
      <p>{text.manualSubmissionHint}</p>
      <ul>
        {groups.map((group) => (
          <li key={group.targetId}>
            <span>{jobsTextTemplates.manualSubmissionWaiting(group.targetName, group.waitingJobs)}</span>
            <WaitingJobSubmission targetId={group.targetId} ownership={group.ownership} />
          </li>
        ))}
      </ul>
      <SubmitCliSetup tokenButton={tokenButton} />
    </section>
  );
}

/**
 * 手動のsiteのJobの投入のしかたを、siteの詳細で示す。ログインノードで1回、コンピュータそのものである
 * PCで待ち受けて、所有者ならtokenのProjectの全員のJob（`--all`）。ほかの人には、代わりに所有者が
 * 投入することもあると伝える。最初のコマンドの前に準備することを続けて示す。
 */
export function ManualSubmissionGuide({
  targetId,
  ownership,
}: {
  targetId: string;
  ownership: ManualSiteOwnership;
}) {
  useLocale();
  const commands: Array<{ label: string; options: ManualSubmitOptions }> = [
    { label: text.manualGuideOnce, options: {} },
    { label: text.manualGuideWatch, options: { watch: true } },
  ];
  // 全員のJobを受け取れるのは所有者だけ。ほかの人には403 site_owner_requiredが返る。
  if (ownership.kind === 'own')
    commands.push({ label: text.manualGuideAll, options: OWNER_SUBMIT_OPTIONS });
  return (
    <section className="site-computer-section" aria-label={text.manualGuideTitle}>
      <h3>{text.manualGuideTitle}</h3>
      <p>{text.manualGuideHint}</p>
      <ul className="site-command-list">
        {commands.map(({ label, options }) => (
          <li key={label}>
            <span>{label}</span>
            <ManualSubmitCommand targetId={targetId} options={options} />
          </li>
        ))}
      </ul>
      <ManualSiteOwnerNote ownership={ownership} />
      <SubmitCliSetup />
    </section>
  );
}
