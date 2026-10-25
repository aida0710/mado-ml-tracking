import { intlLocaleOf } from '@mado/design-system/locale';
import * as english from './en/jobs';
import { localized } from './localized';
import {
  MAX_JOB_ARRAY_SIZE,
  MAX_JOB_GPU_COUNT,
  type JobEndReason,
  type JobPhase,
  type LogEntry,
} from '@mmt/contracts';

// Jobs list and Run logs, with the site Job details (phase, scheduler, array, origin).
export const jobsText = localized({
  jobColumn: 'Job',
  jobRunColumn: 'Run',
  jobActions: '操作',
  logLevelAll: 'すべてのレベル',
  jobPhase: '段階',
  jobLauncherWaiting: '待機中（ランチャーの投入待ち）',
  jobEndReason: '終了の理由',
  jobWhere: '実行場所',
  jobOrigin: '起動元',
  schedulerJobId: 'スケジューラのジョブID',
  schedulerJobIdShort: 'ジョブID',
  jobSubmittedAt: '投入',
  runnerHost: 'runnerのホスト',
  jobSiteJobShell: 'job shellのバージョン',
  parentJob: '親Job',
  jobHook: 'フック',
  jobArray: 'array',
  jobChainDepth: '連鎖の深さ',
  gpuCount: 'GPU数',
  walltime: '制限時間（HH:MM:SS・任意）',
  walltimeShort: '制限時間',
  // A bare 12:00:00 read as the value already set; empty means the site's default.
  walltimePlaceholder: '空欄ならsiteの既定（例: 12:00:00）',
  walltimeUnset: 'siteの既定',
  jobRetryOnFailure: '失敗したら最初から再実行する',
  jobRetryOnTimeout: '時間切れなら最新のcheckpointから再実行する',
  jobAllowChildJobs: 'このJobのコードから子Jobを作れる（ドライバー）',
  jobAutoRetry: '自動の再実行（最大試行回数まで）',
  manualSubmissionTitle: '手動投入を待っているJob',
  manualSubmissionHint:
    '依頼した本人がsite（ログインノードか、コンピュータにしたPC）で次のコマンドを実行すると、待っているJobが投入されます（本人のAPI tokenを使います）。PCを共有している所有者が--allで待ち受けていれば、所有者が投入します。',
  launchManualSubmissionNotice:
    'このコンピュータは手動投入です。起動したJobは、依頼した本人がそのコンピュータで次のコマンドを実行するまで待ちます。',
  manualSubmissionOwnHint:
    'あなたが依頼したJobです。site（ログインノードか、コンピュータにしたPC）で次のコマンドを実行して投入してください（あなたのAPI tokenを使います）。',
  jobArrays: 'Job array',
  jobArraySize: '個数',
  jobArrayStates: '状態（番号ごとの最新の試行）',
  jobArrayShowJobs: 'Jobを表示',
  jobArrayShowAll: 'すべてのJobを表示',
  jobArrayCountsHint: '一覧に読み込んだJobから、番号ごとに最新の試行を数えます。',
  clockDurationError: '時間はHH:MM:SSの形（例: 12:00:00）で指定してください。',
  gpuCountError: `GPU数は0〜${MAX_JOB_GPU_COUNT}の整数で指定してください。`,
  arraySizeError: `arrayの個数は1〜${MAX_JOB_ARRAY_SIZE}の整数で指定してください。`,
  siteGpuIdsError: 'siteではGPU IDではなくGPU数を指定してください。',
  jobCreatedBy: '作成者',
  // Shown in place of the stop and retry buttons, so it stays short enough for the actions column.
  jobControlOwnerOnly: '停止・再実行は作成者かProject adminだけができます',
  jobCancelTitle: 'Jobの停止',
  jobCancelConfirm: '停止する',
  jobCancelEndsAtOnce: 'まだ実行を始めていないので、すぐに取り消します。',
  jobCancelRequestsStop:
    '実行中のプロセスへ停止を頼みます。workerが止めるまで、状態は実行中のままです。このJobから作った子Jobがあれば、それも止めます。',
  jobRetryTitle: '新しいRunで再実行',
  jobRetryConfirm: '再実行する',
  jobRetryEffect:
    '元のRunとJobはそのまま残ります。同じ設定で新しいRunとJobを作って実行し、作ったRunの画面へ移ります。',
  logsSearch: 'ログを検索',
  logsSearchPlaceholder: '探す語（例: Error）',
  logsOrder: '並び順',
  logsOldestFirst: '古い順',
  logsNewestFirst: '新しい順',
  logsJumpToLatest: '最新へ',
  logsDownload: 'ダウンロード',
  logsReadAll: 'すべての行を読み込む',
  logsUpdatesPaused: '読み込んだ時点の行です。自動では更新しません。',
  logsReadNewLines: '新しい行を読み込む',
  logsFollowLatest: '自動で更新する表示に戻る',
  logsNoMatch: '条件に合う行はありません',
  jobDetailClose: '詳細を閉じる',
  runOpenJob: 'Jobを見る',
  launchClearedCodeVersion:
    '選んでいたコードバージョンは、実行種別・モデルバージョンに合わないので外しました。選び直してください。',
  launchClearedTarget:
    '選んでいたコンピュータは、このコードバージョンのRuntimeを使えないので外しました。選び直してください。',
  launchClearedGpus: 'コンピュータを変えたので、選んでいたGPUを外しました。',
  launchGpuChoice: 'GPU（選ばなければCPUのみ）',
  launchFromTaskHint:
    '同じコード・パラメータ・コンピュータで何度も流すときは、Taskにしておくと既定値を入れたまま起動できます。',
  launchOpenTasks: 'Tasksを開く',
  // maxAttempts bounds the automatic retries only (JobService.retry lets a person go past it).
  maxAttemptsHint:
    '自動の再実行はこの回数までです。Jobsの［新しいRunで再実行］で人が流し直す分は数えません。',
} as const, english.jobsText);

export const jobPhaseLabels: Record<JobPhase, string> = localized({
  waiting_manual: '手動投入待ち',
  submitting: '投入中',
  submitted: '待ち行列',
  waiting_resources: '準備・GPU待ち',
  running: '実行中',
}, english.jobPhaseLabels);

export const jobEndReasonLabels: Record<JobEndReason, string> = localized({
  timed_out: '時間切れ',
  queue_timeout: '待ち行列の上限',
  submit_failed: '投入失敗',
}, english.jobEndReasonLabels);

// Text that embeds values.
export const jobsTextTemplates = localized({
  gpuCount: (count: number) => `GPU ×${count}`,
  arrayMember: (index: number, size: number) => `${index} / ${size}`,
  arraySize: (size: number) => `array ×${size}`,
  manualSubmissionWaiting: (siteName: string, count: number) => `${siteName}: ${count}件`,
  jobArrayFilter: (arrayId: string) => `array ${arrayId} のJobだけを表示しています。`,
  jobArrayState: (stateLabel: string, count: number) => `${stateLabel} ${count}`,
  walltimeError: (maxDays: number) =>
    `制限時間は${maxDays}日以内を、HH:MM:SSの形で指定してください。`,
  jobActionTarget: (job: { runName: string; createdByName: string; targetName: string }) =>
    `Run「${job.runName}」　作成者: ${job.createdByName}　実行先: ${job.targetName}`,
  logsShowingLatest: (shown: number, total: number) =>
    `最新の${shown.toLocaleString(intlLocaleOf('ja'))}行を表示しています（全${total.toLocaleString(intlLocaleOf('ja'))}行）。検索とレベルの絞り込みも、この範囲が対象です。ダウンロードはすべての行です。`,
  logsMatchCount: (count: number) => `${count.toLocaleString(intlLocaleOf('ja'))}行が一致`,
  // One read returns at most this many lines; older ones are in the download.
  logsReadLatestLines: (count: number) => `最新の${count.toLocaleString(intlLocaleOf('ja'))}行まで読み込む`,
  attempt: (attempt: number, maxAttempts: number) => `${attempt} / ${maxAttempts}`,
  // A person retried past maxAttempts, which bounds the automatic retries only.
  attemptPastLimit: (attempt: number, maxAttempts: number) =>
    `${attempt}（自動の再実行は${maxAttempts}回目まで）`,
  jobSweepTrialOrigin: (sweepName: string, trialIndex: number) =>
    `Sweep: ${sweepName} #${trialIndex}`,
  jobAutomationOrigin: (ruleName: string) => `自動実行: ${ruleName}`,
  launchCodesHidden: (kindLabel: string, hiddenCount: number) =>
    `実行種別「${kindLabel}」とモデルバージョンに合うコードバージョンだけを選べます（合わないもの ${hiddenCount}件）。ほかのコードを使うときは、先に実行種別を変えてください。`,
}, english.jobsTextTemplates);

export const logLevelLabels: Record<LogEntry['level'], string> = localized({
  info: '情報',
  warning: '警告',
  error: 'エラー',
}, english.logLevelLabels);
