import * as english from './en/models';
import { localized } from './localized';
import type { ModelAliasEventSource } from '@mmt/contracts';

// モデルレジストリの文言。aliasの付与・解除と、aliasの履歴。
export const modelsText = localized({
  aliasReason: '理由',
  aliasReasonPlaceholder: '例: 評価でWERが改善したため',
  removeAlias: 'Aliasを解除',
  aliasesEmpty: 'Aliasはまだ設定されていません',
  aliasHistory: 'Aliasの履歴',
  aliasHistoryEmpty: 'Aliasの変更履歴はまだありません',
  aliasHistoryLoadMore: 'さらに読み込む',
  aliasChangedAt: '日時',
  aliasVersionChange: '旧バージョン → 新バージョン',
  aliasActor: '操作者',
  aliasSource: '経路',
  aliasActorSystem: 'システム',
  aliasActorToken: 'APIトークン',
  aliasUnassigned: '（なし）',
  // モデルバージョンの画面。学習のRun → バージョン → 推論・評価のRun。
  modelVersionNotFound: 'モデルバージョンが見つかりません',
  modelVersionOpenPage: 'バージョンの詳細画面を開く',
  modelVersionArtifactOpen: 'Artifactsで開く',
  modelVersionWeightsArtifact: '重みのArtifact',
  modelVersionSummary: '概要',
  modelVersionLineage: 'データセット → 学習Run → バージョン → 推論・評価Run',
  modelVersionLineageTruncated: '新しい順に最大20件の推論・評価Runを表示しています。',
  modelVersionAliases: 'このバージョンのAlias',
  modelVersionModel: 'モデル',
  modelVersionAutomation: '自動実行',
  modelVersionAutomationTruncated: '新しい順に200件を表示しています。古い実行は自動実行履歴で確認できます。',
  modelVersionNoExecutions: 'このバージョンの自動実行はまだありません',
  evaluationResults: '評価結果',
  evaluationResultsEmpty: 'このバージョンの評価Runはまだありません',
  evaluationResultsTruncated: '新しい順に200件のRunから集約しています。',
  evaluationSummary: '指標の集約',
  evaluationSummaryHint: '各指標の最新値（成功した評価Runのうち、終了が最も新しいもの）。基準バージョンは同じ評価コードバージョン・正解セットの評価と比べます。',
  evaluationSummaryEmpty: '成功した評価Runに指標がありません',
  evaluationLatestValue: '最新値',
  evaluationDeltaSign: '差の符号',
  evaluationRuns: '評価Run',
  evaluationAutomatic: '自動評価',
  evaluationReferenceSet: '正解セット',
  evaluationUpstreamOutputs: '上流の出力',
  versionPromotionEvaluations: 'このバージョンの昇格判定',
  versionPromotionEvaluationsEmpty: 'このバージョンを候補とした昇格判定はまだありません',
  runDownstream: 'このRunから起動したRun',
  runDownstreamEmpty: 'このRunから起動したRunはありません',
  loadMore: 'さらに読み込む',
  // モデル系列。Projectで使っている系列（モデルとコードバージョンのもの）から選ぶ。
  familyHint:
    '既存の系列から選ぶか、新しい系列を入力します。コードバージョンの［対応モデル系列］と同じ文字列のとき、そのコードで動かせます。',
  familiesLoadFailed: '既存の系列を読み込めませんでした。系列はそのまま入力できます。',
  existingFamilies: '既存の系列（押すと追加）',
  // Taskやモデルバージョンが使えるコードバージョン。
  openCodes: 'Codeを開く',
  codeCandidatesNone: 'コードバージョンがまだありません。Codeで登録すると選べます。',
  // モデルバージョンのフォーム。重みは元のRunのArtifactから選ぶ。
  versionAutoNumberHint: '空欄なら自動で番号を付けます。',
  sourceRunHint:
    '学習・ファインチューニングのRunだけを選べます。選ぶと、そのRunのArtifactから重みを選べます。',
  weightsArtifactHintRun: '生成元RunのArtifactを表示しています。保存パスで絞り込めます。',
  weightsArtifactHintProject:
    'プロジェクトのArtifactを新しい順に表示しています。保存パスで検索するか、IDや artifact://… を貼り付けます。',
  weightsArtifactUnchosen:
    '［重みのArtifact］は一覧から選んでください。検索しただけでは選ばれません（使わないときは欄を空にします）。',
  weightsUriHint:
    'Artifactにしていない重み（S3やHugging Faceなど）の場所。Artifactを選んだときは空欄でかまいません。',
  weightsUriIsArtifact: 'これはArtifactを指しています。［重みのArtifact］で選ぶと、取得元として使われます。',
  weightsUriUseAsArtifact: '重みのArtifactとして選ぶ',
  parentsHint: '同じ系列のバージョンだけを選べます。',
  parentsEmpty: '同じ系列のバージョンはまだありません。',
  defaultCodeHint: 'このバージョンの系列に対応するコードバージョンだけを選べます。',
  // どのモデルがどのコードで動くか。ModelsとCodeの両方の画面に出す。
  familyCodeVersions: 'この系列に対応するコードバージョン',
  codeUsage: 'このコードバージョンの使われ方',
  codeUsageModels: '動かせるモデル',
  codeUsageNoModels: '［対応モデル系列］に合うモデルはまだありません',
  codeUsageTasks: '使っているTask',
  codeUsageRules: '使っている自動実行ルール',
} as const, english.modelsText);

// 候補 − 基準の符号。良くなったか悪くなったかはメトリクスによるので出さない。
export const deltaSignLabels = localized({
  positive: '＋（基準より大きい）',
  negative: '－（基準より小さい）',
  zero: '±0（同じ）',
} as const, english.deltaSignLabels);

export const modelAliasSourceLabels: Record<ModelAliasEventSource, string> = localized({
  web: 'Web',
  api: 'API',
  mlflow: 'MLflow',
  promotion_policy: '昇格policy',
  version_deleted: 'バージョンの削除',
  model_deleted: 'モデルの削除',
}, english.modelAliasSourceLabels);

// 値を埋め込む文言。
export const modelsTextTemplates = localized({
  baselineValue: (alias: string) => `基準バージョン（${alias}）`,
  automaticByRule: (ruleName: string) => `自動評価（${ruleName}）`,
  removeAliasConfirm: (alias: string, version: string) =>
    `Alias「${alias}」（バージョン ${version}）を解除します。解除したことは履歴に残ります。`,
  familyUsage: (modelCount: number, codeVersionCount: number) =>
    `モデル${modelCount}件・コード${codeVersionCount}件`,
  familyNew: (family: string) => `新しい系列「${family}」として登録します。`,
  familyCaseVariant: (family: string, variants: readonly string[]) =>
    `「${variants.join('」「')}」が既にあります。大文字・小文字だけが違っても別の系列になり、「${family}」とは対応しません。`,
  familyListCaseVariant: (family: string, variants: readonly string[]) =>
    `「${family}」: 既にある「${variants.join('」「')}」とは大文字・小文字だけが違います。別の系列になり、そちらのモデルには対応しません。`,
  versionAutoNumber: (nextVersion: string) => `空欄なら ${nextVersion} を付けます。`,
  sourceRunOption: (run: { name: string; kind: string; date: string; status: string }) =>
    `${run.name} · ${run.kind} · ${run.date} · ${run.status}`,
  codeCandidatesNoTaskType: (kind: string) =>
    `実行種別「${kind}」に対応するコードバージョンがありません。Codeで［対応する実行種別］に「${kind}」を含むバージョンを作ってください。`,
  codeCandidatesNoFamily: (family: string) =>
    `モデル系列「${family}」に対応するコードバージョンがありません。Codeで［対応モデル系列］に「${family}」を含むバージョンを作ってください。`,
  versionsShown: (shown: number, total: number) => `新しい順に${shown}件を表示しています（全${total}件）。`,
  familyCodeVersionsNone: (family: string) =>
    `まだありません。Codeで［対応モデル系列］に「${family}」を含むコードバージョンを作ると、このモデルのTaskや自動実行に使えます。`,
  codeCandidatesNoCommonFamily: (families: readonly string[]) =>
    `選んだ系列「${families.join('」「')}」をすべて扱えるコードバージョンがありません。1つのコードバージョンの［対応モデル系列］にすべてを含めるか、系列ごとにルールを分けてください。`,
  codeCandidatesCaseVariant: (family: string, variants: readonly string[]) =>
    `コードバージョンには「${variants.join('」「')}」と書かれています。大文字・小文字が違うため「${family}」とは対応しません。`,
}, english.modelsTextTemplates);
