import * as english from './en/workerCoverage';
import { localized } from './localized';
// Whether a worker takes a computer's Jobs and connection checks (lib/workerCoverage), on the
// Compute, Jobs, Sweep and 全体設定 → コンピュータ screens and in the Job launch dialog.
export const workerCoverageText = localized({
  workerCoverageColumn: 'worker',
  // 全体設定 counts every Project's workers, but a worker takes only its own Project's Jobs.
  workerCoverageAnyProject: 'worker（いずれかのProject）',
  workerCoverageAnyProjectHint:
    'JobはそのProjectのworkerだけが受け取ります。Projectごとの状態は、各Projectの［Compute］で確かめてください。',
  workerCoverageNone: 'workerなし',
  workerCoverageOffline: 'workerオフライン',
  workerCoverageNotNeeded: '不要（site）',
  workerCoverageSetupLink: 'workerの設定を開く',
  workerCoverageSetupByOwner:
    'workerを動かすのは、このコンピュータの所有者（所有者がいなければ全体管理者）です。',
  queuedJobNotTaken:
    '担当するworkerは応答していますが、このJobをまだ受け取っていません。考えられる理由は次のとおりです。',
  // The reasons a worker skips a queued Job (the API's claim), most common first. Typed as plain
  // strings: under `as const` the list would be a tuple of these exact Japanese sentences, and
  // TranslationShape would then demand the same sentences from the English catalog.
  queuedJobNotTakenReasons: [
    'コンピュータの同時実行数が埋まっている',
    '選んだGPUをほかのJobが使っている',
    'コンピュータが無効になっている',
    'コンピュータがコードのRuntimeを扱えない',
    'Localのコンピュータで、API serverがlocal executorを許していない（MMT_ALLOW_LOCAL_EXECUTOR）',
  ] as readonly string[],
  launchWorkerMissingHint:
    'このまま起動すると、Jobはworkerが動くまで待機中のままです。',
  queuedJobWaitsForWorker: 'workerが動くまで、このJobは待機中のままです。',
  sweepTrialsWaitForWorker: 'このSweepの試行はこのコンピュータで動くので、workerが動くまで始まりません。',
  workerlessJobsTitle: '始まらない待機中のJob',
  workerlessJobsHint:
    '次のコンピュータには担当するworkerがいないか、応答していません。workerが動くまで、待機中のJobは始まりません。',
  targetCheckWorkerMissing:
    'このコンピュータを名指ししたworker（MMT_WORKER_TARGET_IDS）が応答していないため、接続確認を頼んでも5分後に失敗します。先にworkerを起動してください。',
} as const, english.workerCoverageText);

// Text that embeds values.
export const workerCoverageTextTemplates = localized({
  workerCoverageOnline: (count: number) => `workerオンライン ${count}`,
  workerCoverageOfflineSince: (lastSeen: string) => `最終応答 ${lastSeen}`,
  targetWorkerNone: (targetName: string) =>
    `「${targetName}」を担当するworkerがいません。`,
  targetWorkerOffline: (targetName: string, lastSeen: string) =>
    `「${targetName}」を担当するworkerが応答していません（最終応答 ${lastSeen}）。`,
  targetChoiceWorkerMissing: (label: string, status: string) => `${label}（${status}）`,
  workerlessJobsCount: (targetName: string, count: number) => `${targetName}: 待機中 ${count}件`,
}, english.workerCoverageTextTemplates);
