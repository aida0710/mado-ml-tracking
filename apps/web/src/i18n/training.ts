import * as english from './en/training';
import { localized } from './localized';

export const trainingText = localized(
  {
    trainingSource: '学習元',
    associateTrainingSource: '学習元を紐付け',
    trainingSourceDatasets: 'このRunで使用したデータ',
    trainingSourceDatasetsHint:
      'Run全体で使ったデータの一覧です。checkpointの時点の構成は、Runの［学習データの履歴］で確認できます。',
    trainingSourceHint: 'この重みを作った学習Runと、実際に使ったデータセットの版を記録します。',
    trainingSourceEvidence: '根拠・メモ',
    trainingSourceExisting: '既存の学習Runを選ぶ',
    trainingSourceHistorical: '過去の学習を記録する',
    trainingSourceMode: '学習記録',
    trainingSourceRun: '終了済みの学習Run',
    trainingSourceNoRuns:
      '終了済みの学習Runはありません。［過去の学習を記録する］でデータセットと一緒に登録できます。',
    trainingSourceAppendOnly:
      'モデルの版と重みは保持されます。一度紐付けた学習元は変更できません。',
    trainingSourceHistoricalHint:
      '完了済みの学習を記録します。Jobは起動しません。分からない日時は空欄にしてください。',
    trainingStartedAt: '学習の開始日時',
    trainingEndedAt: '学習の終了日時',
    invalidHistoricalTime: '有効な日付と時刻を入力してください。',
    trainingData: '学習データの履歴',
    trainingDataEmpty: '学習データの変更はまだ記録されていません。',
    recordTrainingData: 'データの変更を記録',
    trainingDataStartStep: 'このデータを使い始めたstep',
    trainingDataConfiguration: 'このstep以降に使うデータセットの全構成',
    trainingDataHint:
      '引き続き使うデータも含めて、全構成を選んでください。学習コードが使ったデータの記録であり、実行中のデータ読み込みは変更しません。',
    trainingDataInitial: '開始時の構成',
    trainingDataAdded: '追加したデータセット',
    trainingDataRemoved: '外したデータセット',
    trainingDataNote: 'メモ',
    continueTraining: 'この重みから学習を続ける',
    continueTrainingHint:
      'このcheckpointから新しい学習Runを作ります。データセットを追加したり、構成を変えたりできます。',
    continueTrainingNoCode: 'このcheckpointから学習を続けるにはコードバージョンが必要です。',
  } as const,
  english.trainingText,
);

export const trainingTextTemplates = localized(
  {
    continueTrainingName: (name: string, step: number) => `${name}（step ${step} から継続）`,
    continueTrainingFromStep: (step: number) => `step ${step} のcheckpointから学習を続けます。`,
    trainingDataFromStep: (step: number) => `step ${step} 以降`,
  },
  english.trainingTextTemplates,
);
