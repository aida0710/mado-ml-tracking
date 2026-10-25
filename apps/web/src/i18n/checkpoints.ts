import * as english from './en/checkpoints';
import { localized } from './localized';
import type { RunCheckpointSource } from '@mmt/contracts';

// Runのcheckpointと、そこからの学習の再開。Runのタブ、再開のダイアログ、Jobsの画面。
export const checkpointsText = localized({
  checkpoints: 'Checkpoint',
  checkpointEmpty:
    'このRunのcheckpointはまだありません。SDKの run.log_checkpoint(ディレクトリ, step=…) で保存すると、ここから続きの学習を始められます。',
  checkpointShowHidden: '保持数を超えた古いcheckpointも表示する',
  checkpointHidden: '保持数外',
  checkpointHiddenHint: '新しいcheckpointが保持数を超えたため一覧から外れています。再開には使えます。',
  checkpointOptimizer: 'Optimizer',
  checkpointIncludesOptimizer: '含む',
  checkpointExcludesOptimizer: '含まない',
  checkpointFramework: 'Framework',
  checkpointResume: 'このcheckpointから再開',
  checkpointResumeTitle: 'checkpointから再開',
  checkpointResumeLatest: '最新checkpointから再開',
  checkpointResumeLatestMessage:
    'このJobのRunで保存された最新（stepが最大）のcheckpointから、新しいRunとして学習を再開します。',
  checkpointResumeKeepsSourceRun: '元のRunとそのcheckpointは変更されません。',
  checkpointResumeSubmit: '新しいRunで再開',
  checkpointResumeNoJob: '元のJobがないため、Jobの再実行はできません。',
  checkpointResumeCreatorOnly: 'checkpointからの再開は、このRunの作成者かProject adminだけができます。',
  checkpointResumedBadge: '再開',
  checkpointResumedBadgeHint: 'checkpointから再開したRunのJobです',
  checkpointSourceRun: '元のRun',
} as const, english.checkpointsText);

// 値を埋め込む文言。catalogのtextTemplatesにまとめる。
export const checkpointsTextTemplates = localized({
  checkpointResumedFromStep: (step: number) => `step ${step} のcheckpointから再開`,
  checkpointResumeMessage: (step: number) =>
    `step ${step} のcheckpointから、新しいRunとして学習を再開します。`,
  checkpointFileCount: (count: number) => `${count} ファイル`,
}, english.checkpointsTextTemplates);

export const checkpointSourceLabels: Record<RunCheckpointSource, string> = localized({
  native: 'SDK',
  mlflow: 'MLflow',
}, english.checkpointSourceLabels);
