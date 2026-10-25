import { localized } from './localized';
import * as english from './en/workflows';

export const workflowsText = localized(
  {
    workflows: 'Workflows',
    workflowDescription: '前処理・学習・評価の条件を固定し、順番に実行します。',
    workflowCatalogBoundary:
      'Data Catalogはデータの出自・処理履歴・保管先を管理します。Workflowsは前処理の条件・品質と、学習で使ったバージョンを記録します。',
    workflowNew: 'ワークフローを作成',
    workflowNewVersion: '新しいバージョンを作成',
    workflowVersion: 'ワークフローのバージョン',
    workflowOlderVersions: '以前のバージョンを読み込む',
    workflowSnapshotHint:
      '保存時点のTaskの設定を固定します。後からTaskを編集しても、このバージョンの条件は変わりません。',
    workflowNewVersionHint: '新しいバージョンには、選んだTaskの現在の設定を保存します。',
    workflowSteps: 'ステップ',
    workflowAddStep: 'ステップを追加',
    workflowRemoveStep: 'ステップを削除',
    workflowRemoveStepConfirm: '削除する',
    workflowStepKey: 'ステップのキー',
    workflowStepName: 'ステップ名',
    workflowTask: 'Task',
    workflowInputs: '入力データ',
    workflowAddInput: '入力を追加',
    workflowSource: '入力元',
    workflowFixedDataset: '固定したデータセットバージョン',
    workflowStepDataset: '前のステップの出力',
    workflowSourceStep: '出力元のステップ',
    workflowDatasetName: '出力データセット名（空ならすべて）',
    workflowDatasetVersion: 'データセットバージョン',
    workflowRole: '用途',
    workflowWeight: '混合比率の重み',
    workflowSelection: '抽出条件（JSON）',
    workflowSelectionHint:
      '抽出条件と重みは実行コードで読み取って使います。設定を保存するだけでは、抽出や混合は行われません。',
    workflowModelSource: '入力モデル',
    workflowTaskModel: 'Taskのモデルを使う',
    workflowQualityGates: '次へ進む条件',
    workflowAddGate: '品質条件を追加',
    workflowMetric: 'メトリクス',
    workflowOperator: '比較方法',
    workflowThreshold: '閾値',
    workflowGateHint:
      '必要なメトリクスがない場合や条件を満たさない場合は、後続のステップを停止します。',
    workflowStart: 'ワークフローを実行',
    workflowStartConfirm: '実行する',
    workflowStartEffect:
      '各ステップのTaskを、このバージョンに保存した設定で順番にJobとして起動します。',
    workflowResume: '新しい実行として再開',
    workflowResumeConfirm: '再開する',
    workflowResumeHint: '成功したステップのRunと出力を再利用し、未完了のステップから再実行します。',
    workflowResumeEffect:
      '成功したステップのRunと出力を再利用し、最初の未完了のステップから新しい実行で動かします。元の実行の履歴は残ります。',
    workflowCancel: 'ワークフローを停止',
    workflowCancelConfirm: '停止する',
    workflowCancelEffect:
      '実行中のJobに停止を依頼し、後続のステップは起動しません。Jobが止まるまで「停止要求済み」と表示します。',
    workflowControlOwnerOnly: '停止・再開は、実行の作成者かProject adminだけができます',
    workflowHistory: '実行履歴',
    workflowExecution: '実行',
    workflowCompare: '比較する実行',
    workflowNoComparison: '比較しない',
    workflowNoExecutions: '実行履歴はまだありません',
    workflowNoTasks: 'まず、実行先を指定したTaskを作成してください。',
    workflowReused: '前の実行から再利用',
    workflowOpenRun: 'Runを開く',
    workflowOpenJob: 'Jobを開く',
    workflowOpen: 'ワークフローを開く',
    workflowResumeFromJob: 'ワークフローの画面で再開',
    workflowNextPage: '以前の実行',
    workflowFirstPage: '最新の実行',
    workflowOutputs: '出力バージョン',
    workflowInputRole: '前処理の入力',
    workflowTrainingRole: '学習',
    workflowValidationRole: '検証',
    workflowTestRole: 'テスト',
    workflowPending: '前のステップの完了待ち',
    workflowChoose: '選択してください',
    workflowDraftTaskMissing: 'Taskを選んでください。',
    workflowDraftNameOrKeyMissing: 'ステップ名とキーを入力してください。',
    workflowDraftModelSourceNotEarlier: '入力モデルの引き継ぎ元は、前のステップから選んでください。',
    workflowDraftSourceStepNotEarlier: '出力元は、前のステップから選んでください。',
    workflowDraftDatasetVersionMissing: 'データセットバージョンを選んでください。',
    workflowDraftSelectionInvalid:
      '抽出条件は、{ } で囲んだ JSON のオブジェクトにしてください（条件が無ければ {}）。',
    workflowDraftWeightInvalid: '重みは0より大きい数にしてください。',
    workflowDraftGateInvalid: 'メトリクス名と、数値の閾値を入力してください。',
    workflowDraftStepInvalid: 'ステップの設定を確認してください。',
    preprocessingReport: '前処理レポート',
    preprocessingNoReport:
      'レポートはまだありません。前処理コードからRun.log_preprocessing_report()で記録できます。',
    preprocessingInput: '入力件数',
    preprocessingOutput: '出力件数',
    preprocessingExcluded: '除外件数',
    preprocessingFailed: '失敗件数',
    preprocessingInputDuration: '入力の時間（秒）',
    preprocessingOutputDuration: '出力の時間（秒）',
    preprocessingReasons: '除外・失敗の理由',
    preprocessingSamples: 'サンプルのArtifact',
    preprocessingReasonsJson: '除外・失敗の理由（JSON）',
    preprocessingMetricsJson: 'メトリクス（JSON）',
    preprocessingSampleIds: 'サンプルのArtifact ID',
    preprocessingReportEdit: '前処理レポートを記録',
    preprocessingReportHint:
      'Runの終了時にレポートを固定します。理由別の件数、品質メトリクス、サンプルのArtifact IDもSDKやAPIから記録できます。',
    preprocessingReasonsInvalid:
      '除外・失敗の理由は {"exclusions": [{"reason": "短い音声", "count": 3}], "failures": []} の形の JSON にしてください。',
    preprocessingMetricsInvalid:
      'メトリクスは、名前と数値の組の JSON オブジェクトにしてください。名前は preprocessing. で始められません（集計値の名前です）。',
    preprocessingReportInvalid:
      '件数と時間は0以上にし、除外と失敗の合計を入力件数以下に、理由別の件数をそれぞれの合計に合わせてください。サンプルにはこのRunのArtifact IDを指定します。',
    preprocessingUsage: 'この実行でのデータの用途',
  } as const,
  english.workflowsText,
);

// 値を埋め込む文言。
export const workflowsTextTemplates = localized(
  {
    workflowVersionLabel: (revision: number) => `v${revision}`,
    workflowStartTarget: (workflowName: string, revision: number) =>
      `ワークフロー「${workflowName}」のバージョン v${revision} を実行します。`,
    workflowResumeTarget: (executionId: string, revision: number) =>
      `実行 ${executionId}（バージョン v${revision}）を、新しい実行として再開します。`,
    workflowCancelTarget: (execution: {
      executionId: string;
      revision: number;
      createdByName: string;
    }) =>
      `実行 ${execution.executionId}（バージョン v${execution.revision}）　作成者: ${execution.createdByName}`,
    workflowStarted: (executionId: string, revision: number) =>
      `実行 ${executionId}（バージョン v${revision}）を開始しました。`,
    workflowCancelRequested: (executionId: string) =>
      `実行 ${executionId} の停止を依頼しました。実行中のJobが止まると「中止」になります。`,
    workflowRemoveStepTarget: (stepName: string) =>
      `ステップ「${stepName}」を削除します。このステップを入力やモデルの引き継ぎ元にしている後のステップは、選び直しが必要になります。`,
    workflowMissingStepReference: (stepKey: string) =>
      `前のステップ「${stepKey}」が見つかりません。選び直してください。`,
    workflowDraftStepProblem: (step: number, problem: string) => `ステップ${step}: ${problem}`,
    workflowDraftInputProblem: (step: number, input: number, problem: string) =>
      `ステップ${step}の入力${input}: ${problem}`,
    workflowDraftGateProblem: (step: number, gate: number, problem: string) =>
      `ステップ${step}の品質条件${gate}: ${problem}`,
    workflowDraftDuplicateKey: (stepKey: string) =>
      `キー「${stepKey}」は前のステップで使われています。別のキーにしてください。`,
    workflowDraftUnknownPreprocessingMetric: (names: string) =>
      `preprocessing. で始まるメトリクスは、前処理レポートの集計値（${names}）だけです。独自の品質値には別の名前を使ってください。`,
  },
  english.workflowsTextTemplates,
);
