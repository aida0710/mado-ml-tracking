import * as english from './en/computerSetup';
import { localized } from './localized';
import type { TargetDirectoryListingOutcome } from '@mmt/contracts';

// sshかlocalのコンピュータを2段階で追加・編集する。1「接続」（workerがどうつなぐか）、
// 2「接続後の設定」（そのJobが使うもの。workerの接続確認の結果で埋める）。
export const computerSetupText = localized({
  setupStepConnection: '接続',
  setupStepSettings: '接続後の設定',
  computerKindLegend: '種類',
  computerKindSshHint: 'workerがSSHで入ってJobを動かします（GPUサーバー、ログインノードなど）。',
  computerKindLocalHint: 'workerのホストの上でJobを動かします（開発用）。',
  computerKindSiteHint:
    'ランチャーか mado-tracking submit がジョブスケジューラに投入します（スパコンなど）。',
  computerKindFixed: '登録済みのコンピュータなので、種類は変えられません。',
  checkWorker: '接続に使うworker',
  checkWorkerHint:
    'このworkerが自分のSSH鍵で接続を確かめます。SSH鍵とknown_hostsのパスは、このworkerのホスト上のファイルから選べます。',
  checkWorkerLocalHint: 'このworkerが自分のホストの上で確かめます。',
  checkWorkersNone:
    '接続を確かめられるworkerがオンラインにありません。workerを起動して［workerを読み直す］を押すか、確認せずに次へ進んで手で入力してください。',
  checkWorkersReload: 'workerを読み直す',
  sshFileHintNoWorker: 'workerを選ぶと、そのworkerのホスト上の鍵が候補に出ます。',
  checkAndContinue: '接続を確認して次へ',
  continueWithoutCheck: '確認せずに次へ',
  recheck: '再確認',
  recheckHint: '保存していない接続の変更は、確認の前に保存します。',
  checkQueued: 'workerが確認を始めるのを待っています…',
  checkRunning: 'workerが接続を確認しています…',
  checkReached: '接続を確認しました',
  checkNotReached: '接続を確認できませんでした',
  checkNoWorkerShort:
    '選んだworkerが確認を受け取りませんでした。workerが動いているか確認してください。',
  checkClaimTimeoutShort: 'workerから結果が届きませんでした。workerのログを確認してください。',
  checkFailedNext:
    '接続を直して［接続を確認して次へ］を押すか、［確認せずに次へ］で手で入力してください。',
  checkDetails: '確認の詳細',
  setupWithoutCheck:
    '接続確認の結果が無いので、候補は出ません。作業ディレクトリとPythonのパスを手で入力してください。',
  setupFromCheck: '接続確認の結果から入力しました。必要なら直してください。',
  workDirectoryHint:
    'Jobのディレクトリとデータセットのcacheを置く場所です。/ で終わるところまで入力すると、workerがその中を読みます。',
  pythonExecutableHint: 'Pythonで動くJobとrunnerに使います（3.11以上）。',
  directoryListingLoading: 'workerがディレクトリを読んでいます…',
  directoryListingFailed: 'ディレクトリを読めませんでした（workerが応答しません）',
  directoryListingTruncated: '項目が多いので、最初の一部だけを出しています',
  directoryWritable: '書き込める',
  directoryNotWritable: '書き込めない',
  pythonVersionUnknown: 'バージョン不明',
  runtimeKindsFromCheck: '確認で動いたRuntimeを選んでいます。',
  detectedGpusLegend: 'GPU（見つかったもの）',
  gpuIdsManualHint:
    'ログインノードからジョブを出すときのように、確認したマシンとJobが動くマシンが違う場合は、ここに手で入力してください。',
  maxConcurrentJobsHint: '既定は選んだGPUの数です（GPUが無ければ1）。',
  enabledHint: '有効にすると、このコンピュータでJobが動き始めます。',
  hostFacts: 'マシン',
} as const, english.computerSetupText);

export const computerSetupTextTemplates = localized({
  checkWorkerLabel: (workerId: string, hostname: string | null) =>
    hostname ? `${workerId}（${hostname}）` : workerId,
  checkWorkerSource: (tokenName: string) => `token: ${tokenName}`,
  cpuArchDetected: (machine: string) => `確認の結果: ${machine}`,
  cpuArchUnknown: (machine: string) =>
    `確認の結果は ${machine} です。対応するアーキテクチャを選んでください。`,
  hostFactsSummary: (facts: string[]) => facts.join(' · '),
  cpuCount: (count: number) => `${count}コア`,
  directoryFree: (free: string) => `空き ${free}`,
  gpuOption: (index: string, name: string, memory: string) => `${index}: ${name}（${memory}）`,
}, english.computerSetupTextTemplates);

export const directoryListingOutcomeNotes = localized({
  ok: '',
  missing: 'このディレクトリはありません',
  not_directory: 'ディレクトリではありません',
  denied: 'このディレクトリは読めません（権限がありません）',
  unreachable: 'workerが接続できませんでした',
} satisfies Record<TargetDirectoryListingOutcome, string>, english.directoryListingOutcomeNotes);
