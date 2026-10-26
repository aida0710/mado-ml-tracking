import { GLOBAL_TOKEN_SCOPES, type ApiErrorCode, type TokenPurpose, type TokenScope } from '@mmt/contracts';
import type { ApiError } from '@mado/design-system/http';
import { formatBytes } from '../lib/format';
import { tokenPurposeLabels } from './serviceAccounts';

/*
 * 日本語の画面で出す、API のエラーの code ごとの文（lib/apiErrorMessage.ts）。英語の画面は API の英語の
 * 文をそのまま出すので、英語の対になる文は持たない。ここに無い code は日本語の画面でも API の英語の文を
 * 出す。文に入る値は、応答の error・code の横の項目から読む。
 */

/** 応答の error・code の横の項目（受け取ったまま。値の型は code ごとに確かめて読む）。 */
type ErrorDetails = ApiError['details'];
export type JapaneseApiErrorText = string | ((details: ErrorDetails) => string);

/** 横の項目の値を文に入れる形にする。配列は「、」でつなぐ。 */
function shown(value: unknown): string {
  if (Array.isArray(value)) return value.map(shown).join('、');
  return value === undefined || value === null ? '' : String(value);
}

function bytes(value: unknown): string {
  return typeof value === 'number' ? formatBytes(value) : shown(value);
}

const hasDetail = (details: ErrorDetails, field: string) => details[field] !== undefined;

/**
 * 理由が幅広い code。日本語の文の後に、API の英語の文を詳細として括弧で添える
 * （「入力内容を確認してください。（invalid request: name）」）。
 */
export const japaneseApiErrorLeads: Partial<Record<ApiErrorCode, string>> = {
  invalid_request: '入力内容を確認してください。',
  conflict: '今の状態ではこの操作はできません。',
  not_found: '見つかりません。削除されたか、見る権限がありません。',
};

// token の scope が足りないとき、どこで発行し直すか（API の apps/api/src/domain/tokenAccessErrors.ts と同じ分け方）。
function scopeRequired(details: ErrorDetails): string {
  if (Array.isArray(details.scopes))
    return `ユーザーの変更には、すべてのscopeを持つtokenが必要です。足りないscope: ${shown(details.scopes)}`;
  const scope = shown(details.scope);
  const lead = `API tokenのscopeが不足しています。この操作には${scope}が要ります。`;
  if (GLOBAL_TOKEN_SCOPES.includes(scope as TokenScope))
    return `${lead}全体管理者がProjectを指定せずに、${scope}を含むtokenを発行してください`;
  const purpose = details.purpose as TokenPurpose | null | undefined;
  return purpose && Object.hasOwn(tokenPurposeLabels, purpose)
    ? `${lead}［プロジェクト設定］の［API tokenを発行］で用途「${tokenPurposeLabels[purpose].label}」を選び、tokenを発行し直してください`
    : `${lead}ProjectのAdminに、${scope}を含むtokenの発行を頼んでください`;
}

function projectForbidden(details: ErrorDetails): string {
  if (!Object.hasOwn(details, 'tokenProjectName')) return 'Projectの権限が不足しています';
  const owner = details.tokenProjectName ? `Project「${shown(details.tokenProjectName)}」` : '別のProject';
  return `API tokenのprojectが一致しません。このtokenは${owner}用です。接続先のProject ID（MMT_PROJECT_ID・MLFLOW_TRACKING_URI）を確かめるか、接続先のProjectで発行したtokenを使ってください`;
}

// 削除できないデータセットのバージョンを使っているもの（API の datasetVersionUsage.ts の種類）。
const DATASET_VERSION_USAGE_LABELS: Readonly<Record<string, string>> = {
  runInput: 'Runの入力',
  runOutput: 'Runの出力',
  childVersion: 'このバージョンを親にしたバージョン',
  parentAddition: '親の追記履歴',
  lineageRelation: '来歴の補完記録',
  task: 'Taskの入力',
  automationRule: '自動実行ルールの入力',
  hook: 'フックの入力',
  jobPartition: 'Jobの分割の入力',
  outputDeclaration: 'Runの出力の宣言',
  mlflowDataset: 'MLflowの記録',
  workflowVersion: 'ワークフローの入力',
};

function datasetVersionInUse(details: ErrorDetails): string {
  const usages = typeof details.usages === 'object' && details.usages !== null ? details.usages : {};
  const uses = Object.entries(usages).map(
    ([kind, count]) => `${DATASET_VERSION_USAGE_LABELS[kind] ?? kind} ${shown(count)}件`,
  );
  return `このバージョンは使われているため削除できません（${uses.join('、')}）`;
}

// 削除できない Artifact を参照しているもの（API の artifactDeletionService.ts の種類）。
const ARTIFACT_REFERENCE_LABELS: Readonly<Record<string, string>> = {
  model_version: '登録モデルバージョン',
  code_version: 'コードバージョン',
  dataset_version: 'データセットバージョン',
  checkpoint: '保持中のcheckpoint',
  preprocessing_report: '前処理のレポート',
};

// mado S3 Data Catalogのアクセストークンで許可してほしい権限（API の plugins/mado/accessTokenRequirements.ts）。
const MADO_SCOPE_LABELS: Readonly<Record<string, string>> = {
  'lineage:read': 'DataLineageの読み取り',
  'lineage:write': 'DataLineageの送信',
};

// early_terminate の違反の理由（contracts の SWEEP_EARLY_TERMINATE_VIOLATIONS）。
function sweepEarlyTerminateInvalid(details: ErrorDetails): string {
  switch (details.reason) {
    case 'type_unsupported':
      return `early_terminate の type「${shown(details.type)}」は使えません`;
    case 'min_iter_positive':
      return `early_terminate の minIter は正の数である必要があります（minIter=${shown(details.minIter)}）`;
    case 'eta_integer':
      return `early_terminate の eta は2以上の整数である必要があります（eta=${shown(details.eta)}）`;
    default:
      return `early_terminate の maxIter は minIter より大きい必要があります（maxIter=${shown(details.maxIter)}）`;
  }
}

export const japaneseApiErrorMessages: Partial<Record<ApiErrorCode, JapaneseApiErrorText>> = {
  // 要求の形
  invalid_json: 'JSONを読み込めません',
  invalid_cursor: 'ページの続きの位置（cursor）が不正です。最初のページから開き直してください',
  body_too_large: (details) =>
    hasDetail(details, 'maxBytes')
      ? `payloadは${bytes(details.maxBytes)}までです`
      : 'リクエストが上限サイズを超えています',
  range_not_satisfiable: '要求されたRangeは読み込めません',
  invalid_expiry: 'tokenの期限は未来の日時を指定してください',
  invalid_public_key: 'ssh-ed25519の公開鍵（1行）を送ってください',
  // 認証
  authentication_required: 'ログインが必要です',
  invalid_token: 'API tokenが無効または失効しています',
  invalid_credentials: 'ユーザー名またはパスワードが正しくありません',
  incorrect_password: '現在のパスワードが正しくありません',
  weak_password: 'パスワードは12〜1024 byteにしてください。変更するときは現在と異なるものにしてください',
  rate_limited: '試行回数の上限に達しました。しばらく待ってから再試行してください',
  password_change_required: 'パスワードを変更してから操作してください',
  password_changed_concurrently: 'パスワードが別の操作で変更されました。もう一度ログインしてください',
  local_credential_unavailable: 'ローカルアカウントを持たないユーザーです',
  local_login_disabled: 'ローカルアカウントのログインは無効です',
  development_login_disabled: 'Development loginは無効です',
  oidc_disabled: 'SSOのログインは無効です',
  oidc_authentication_failed: 'SSOの認証に失敗しました',
  oidc_unavailable: 'SSOのログイン状態を確認できません。しばらくしてから再度お試しください',
  invalid_oidc_state: 'ログインが失効したか、ブラウザが一致しません。もう一度ログインしてください',
  invalid_origin: 'リクエストのOriginが許可されていません',
  basic_auth_unsupported: 'Basic認証はMLflow互換APIだけで使えます。Bearer tokenを使ってください',
  identity_sync_required:
    'SSOのgroupが長く確認されていないため、このtokenは止まっています。ブラウザで一度ログインしてください',
  session_required: 'この操作にはブラウザでのログインが必要です',
  // 認可と token
  scope_required: scopeRequired,
  admin_required: '全体管理者の権限が必要です',
  project_forbidden: projectForbidden,
  membership_required: 'tokenの所有者はProjectのメンバーである必要があります',
  token_forbidden: '他の利用者のtokenは変更できません',
  token_authority_exceeded: (details) => `このtokenが持たないscopeのtokenは扱えません: ${shown(details.scopes)}`,
  token_outlives_issuer:
    'このtokenより後まで有効なtokenは扱えません。有効期限をこのtokenの期限以前にしてください',
  global_scope_requires_unrestricted_token: (details) =>
    `${shown(details.scopes)}は、全体管理者がProjectを指定せずに発行するtokenだけが持てます`,
  scope_exceeds_role: (details) =>
    `Service AccountのRole（${shown(details.role)}）では使えないscopeです: ${shown(details.scopes)}`,
  api_token_required: '本人のAPI tokenで認証してください',
  job_token_forbidden: 'Job限定tokenではこの操作はできません',
  // ユーザーと Project
  last_active_admin: '最後の有効な全体管理者は無効化・降格できません',
  username_taken: '同じユーザー名が既にあります',
  admin_role_managed_by_sso: 'SSOユーザーの全体管理者権限はAuthentikのgroupで決まるため変更できません',
  profile_managed_by_sso: 'SSOユーザーの表示名はAuthentikから同期されるため変更できません',
  service_account_admin_forbidden: 'Service Accountは全体管理者にできません',
  service_account_disabled: '無効化したService Accountにはtokenを発行できません',
  service_account_role_missing: 'Service AccountにProjectのRoleがありません',
  duplicate_project_member: '同じユーザーが2回指定されています',
  invalid_project_member: 'メンバーに追加できるのは有効な利用者だけです',
  project_archived: 'このProjectはアーカイブされています。全体管理者が全体管理の「プロジェクト」から元に戻せます',
  project_not_archived: 'アーカイブしていないProjectは完全に削除できません',
  project_has_active_jobs: '待機中・実行中のJobがあるProjectはアーカイブできません',
  project_required: 'worker tokenと書き込みtokenはProjectを指定して発行してください',
  // 対象の有無と整合
  already_exists: '同じ名前またはバージョンが既に登録されています',
  invalid_reference: '参照先が無いか、変更できないバージョンを変えようとしています',
  // Run と記録
  run_deleted: '削除済みのRunにはこの操作を行えません',
  run_finalized: 'Jobが終了したRunには記録を追加・変更できません',
  run_not_started: '開始していないRunは再開できません',
  reserved_tag: (details) => `${shown(details.tag)}はサーバーが管理する予約tagのため変更できません`,
  code_required: '実行するコードバージョンが必要です',
  test_entrypoint_required: 'コードバージョンにテストコマンドが登録されていません',
  execution_snapshot_mismatch: 'Runの固定実行内容がコードバージョンと一致しません',
  runtime_mismatch: 'Runの固定runtimeがコードバージョンと一致しません',
  incompatible_runtime: 'コンピュータがこのruntimeに対応していません',
  incompatible_model_family: (details) =>
    `モデル系列${shown(details.modelFamily)}に対応していないか、ルールの対象に含まれていません`,
  incompatible_task_type: (details) => `Run kind ${shown(details.runKind)}に対応していないコードバージョンです`,
  sync_run_conflict: 'このRun IDは別のRunが使っているため後送りできません',
  sync_param_conflict: (details) => `記録済みのparamは別の値に変更できません: ${shown(details.keys)}`,
  sync_status_conflict: (details) =>
    `Runは既に${shown(details.runStatus)}で終わっているため${shown(details.requestedStatus)}にできません`,
  sync_ended_before_start: 'endedAtがRunの開始より前です',
  sync_timestamp_in_future: (details) =>
    `${shown(details.field)}が現在時刻より${shown(details.maxSkewSeconds)}秒以上先です。記録したコンピュータの時計を確認してください`,
  too_many_runs: (details) => `対象のRunが多すぎます（上限${shown(details.limit)}件）。条件を絞ってください`,
  too_many_parameters: (details) => `重要度の計算に使えるparameterは${shown(details.limit)}個までです`,
  too_many_groups: (details) => `グループが${shown(details.limit)}件を超えています`,
  too_many_points: '応答の点数が上限を超えます。maxPointsかkeysを減らしてください',
  series_query_timeout: 'メトリクスの集計が時間内に終わりませんでした。Runかkeyを減らしてください',
  target_metric_required: 'targetMetricを指定してください',
  // Artifact と upload
  artifact_content_not_found: 'Artifactの実ファイルが見つかりません',
  artifact_hash_mismatch: 'SIF ArtifactのSHA256が一致しません',
  artifact_in_use: (details) =>
    `${shown(
      (Array.isArray(details.references) ? details.references : []).map(
        (kind: unknown) => ARTIFACT_REFERENCE_LABELS[String(kind)] ?? String(kind),
      ),
    )}から参照されているため削除できません`,
  artifact_read_failed: 'Artifactを読み込めません',
  artifact_save_failed: 'Artifactを保存できませんでした',
  artifact_too_large: (details) => `Artifactの上限サイズ（${bytes(details.maxBytes)}）を超えています`,
  invalid_artifact_path: 'Artifactには安全な相対パスが必要です',
  backend_unavailable: 'Artifactの保存先が設定されていません',
  upload_expired: 'アップロードの有効期限が切れています',
  upload_finalize_pending: 'Artifactの検証が続いています。完了後に一覧へ表示されます',
  upload_forbidden: 'このアップロードは、作成したユーザーと認証情報だけが使えます',
  upload_incomplete: (details) => `受け取っていないpartが${shown(details.missingParts)}件あります`,
  upload_not_open: 'このアップロードはデータを受け付けていません',
  part_checksum_mismatch: 'アップロードしたpartのSHA-256が一致しません',
  part_replaced: (details) => `part ${shown(details.partNumber)}は送信後に置き換えられています`,
  part_size_mismatch: (details) =>
    hasDetail(details, 'expectedBytes')
      ? `part ${shown(details.partNumber)}のContent-Lengthは${shown(details.expectedBytes)} bytesにしてください`
      : 'partの長さがContent-Lengthと一致しません',
  part_too_small: (details) => `最後以外のpartは${bytes(details.minBytes)}以上にしてください`,
  invalid_part_number: (details) => `part番号は1〜${shown(details.partCount)}です`,
  invalid_part_size: (details) =>
    hasDetail(details, 'minBytes')
      ? `partSizeは${bytes(details.minBytes)}〜${bytes(details.maxBytes)}にしてください`
      : `partは${bytes(details.maxBytes)}以下にしてください`,
  invalid_parts: (details) =>
    hasDetail(details, 'partNumber')
      ? `part ${shown(details.partNumber)}は受け取っていません`
      : 'partsは全partを1件ずつ指定してください',
  too_many_parts: (details) => `part数が上限${shown(details.limit)}を超えます。partSizeを大きくしてください`,
  // 保存先
  storage_backend_disabled: 'この保存先は無効になっているため新しいArtifactを保存できません',
  storage_backend_exists: '同じ名前の保存先が既にあります',
  storage_backend_in_use:
    'この保存先を参照するArtifactがあるため、種類・bucket・endpoint・prefix・rootPathは変更できません',
  storage_backend_is_default: '既定の保存先は無効にできません。先に既定を切り替えてください',
  storage_backend_read_only: '環境変数で設定した保存先は画面やAPIから変更できません',
  storage_backend_unavailable: '既定には有効な保存先だけを指定できます',
  storage_credentials_incomplete: 'access key idとsecret access keyは両方指定するか、両方とも空にしてください',
  storage_secret_key_missing: 'MMT_STORAGE_SECRET_KEYが設定されていないためsecretを保存できません',
  invalid_storage_backend_config: (details) =>
    hasDetail(details, 'field')
      ? `保存先の設定が不正です: ${shown(details.field)}`
      : 'filesystemの保存先には認証情報とCAを設定できません',
  invalid_storage_backend_name: '保存先の名前は小文字英数字とハイフンで指定してください',
  // データセット
  dataset_archived: (details) =>
    `アーカイブ済みのデータセットのバージョンは新しいRunの入力に使えません: ${shown(details.datasets)}`,
  dataset_artifact_not_found: (details) =>
    `このProjectに保存済みのArtifactではありません: ${shown(details.artifactIds)}`,
  dataset_content_empty: 'prefixの下にRunのArtifactがありません',
  dataset_digest_invalid: 'digestは sha256:<64桁の小文字16進数> の形で指定してください（sha256:は省略可）',
  dataset_digest_mismatch: (details) =>
    `digestがファイル一覧から計算した値（${shown(details.expectedDigest)}）と一致しません`,
  dataset_partition_invalid: '分割するデータセットバージョンは、入力に含まれるartifactsのバージョンにしてください',
  dataset_source_run_mismatch: 'sourceRunIdはfromRunArtifactsのRunと同じにしてください',
  dataset_too_many_files: (details) => `データセットバージョンのファイル数は${shown(details.limit)}件までです`,
  dataset_version_in_use: datasetVersionInUse,
  // モデル、出力、来歴、学習データ
  model_deleted: '削除済みのモデルです',
  model_family_mismatch: (details) =>
    hasDetail(details, 'modelFamily')
      ? `同じ名前のモデルが系列${shown(details.modelFamily)}で登録されています`
      : 'Taskが作成するモデルと同じ名前のモデルが別の系列で存在します',
  model_training_source_conflict: 'このモデルバージョンには別の学習元が記録されています',
  model_training_source_cycle: 'モデルバージョンが学習元の入力や祖先になっています',
  model_training_source_not_terminal: '終了済みの学習Runを選んでください',
  output_artifact_not_found: (details) => `出力${shown(details.path)}はこのJobのArtifactとして保存されていません`,
  output_declaration_limit: (details) =>
    `出力の宣言はRunごとにモデル${shown(details.modelLimit)}件・データセット${shown(details.datasetLimit)}件までです`,
  output_declaration_mismatch: '同じindexに別の種類の出力が登録済みです',
  output_model_conflict: 'Taskの出力モデルと別のモデルは宣言できません',
  output_model_kind: '出力モデルはtrainingまたはfinetuningのRun・Taskでだけ扱えます',
  output_model_required: 'Taskに出力モデルの設定が無いRunでは宣言にmodelIdが必要です',
  output_registration_not_found: 'Taskの出力モデル登録の記録がありません',
  alias_evaluation_mismatch: '根拠の判定は、同じモデル・同じバージョン・同じaliasを対象にしたものを指定してください',
  alias_evaluation_not_passed: '根拠の判定が合格ではありません（再判定で置き換わった判定も使えません）',
  alias_evaluation_required: (details) =>
    `保護alias「${shown(details.alias)}」を変更するには、このバージョンの合格判定（evaluationId）を指定してください`,
  alias_protected: (details) => `保護alias「${shown(details.alias)}」を変更する権限がありません`,
  alias_reason_required: (details) =>
    `保護alias「${shown(details.alias)}」を合格判定なしで変更するには理由を入力してください`,
  lineage_output_conflict: '別の生成元が記録されています',
  lineage_relation_cycle: '来歴が循環します',
  lineage_run_not_terminal: '終了済みの有効なRunだけ補完できます',
  training_data_run_kind: '学習データの履歴はtrainingまたはfinetuningのRunに記録してください',
  training_data_stage_checkpoint: 'このRunの開始stepより前のcheckpointを選んでください',
  training_data_stage_conflict: 'このstepには別の学習データが記録されています',
  training_data_stage_cycle: 'このRunの出力から作られたデータは入力に追加できません',
  training_data_stage_order: '記録済みのstepより後の学習データを追加してください',
  // checkpoint
  checkpoint_artifact_missing: 'checkpointのArtifactが保存されていません',
  checkpoint_artifact_run: 'checkpointには同じRunに保存したArtifactを指定してください',
  checkpoint_code_mismatch: 'checkpointは元のRunと同じコードバージョンで再開してください',
  checkpoint_exists: 'このstepのcheckpointは登録済みです',
  checkpoint_finalized: '終了したRunのcheckpointにはファイルを追加できません',
  checkpoint_kind_mismatch: 'checkpointは元のRunと同じ種類（trainingまたはfinetuning）のRunでだけ再開できます',
  checkpoint_not_found: '再開できるcheckpointがありません',
  checkpoint_run_kind: 'checkpointはtrainingまたはfinetuningのRunにだけ登録できます',
  // media
  media_artifact_run: '同じRunに保存したArtifactを指定してください',
  media_artifact_unavailable: '保存が完了したArtifactを指定してください',
  media_conflict: 'このidのmediaは別の内容で登録済みです',
  media_duplicate_item: '同じidまたは同じkey・step・Artifactの項目が重複しています',
  media_exists: '同じkey・step・Artifactのmediaは登録済みです',
  media_kind_mismatch: 'mediaの種類とArtifactのMIME typeが一致しません',
  media_not_table: 'このmediaは表ではありません',
  media_table_invalid: (details) => `表の形式が不正です（${shown(details.detail)}）`,
  media_table_too_large: (details) =>
    `表が${bytes(details.maxBytes)}を超えています。Artifactをダウンロードして開いてください`,
  unsupported_table_format: 'parquetの表は表示できません。JSONで記録してください',
  // 自動実行と昇格
  automation_chain_cycle: 'ルールの連鎖が循環しています',
  automation_chain_too_deep: (details) => `ルールの連鎖は${shown(details.limit)}段までです`,
  automation_execution_active: '同じルールとモデルバージョンの実行が待機中または実行中です',
  automation_rule_disabled: '無効なルールは適用できません',
  automation_trigger_mismatch:
    '連鎖するルールには上流RunのID（triggerRunId）を、モデル登録で起動するルールにはモデルバージョンのID（modelVersionId）を指定します',
  invalid_automation_owner: '移管先は同じプロジェクトの有効なService Account（role admin）にしてください',
  invalid_automation_trigger: 'upstreamRuleIdはtriggerがupstream_run_finishedのときだけ、必ず指定します',
  upstream_outputs_missing: '上流Runに出力データセットバージョンがありません',
  upstream_rule_disabled: '上流のルールが無効です',
  upstream_rule_mismatch: '指定したRunはこのルールの上流ルールが作ったRunではありません',
  upstream_run_not_finished: '上流Runが成功していません',
  promotion_owner_invalid: '移管先には、このProjectの有効なService Account（roleがadmin）を指定してください',
  promotion_rule_family_mismatch: '評価ruleの対象系列にモデルの系列が含まれていません',
  promotion_rule_not_evaluation: '評価ruleにはkind=evaluationの自動実行ruleを指定してください',
  // Job と実行
  job_already_retried: 'このJobは別の条件で再実行済みです',
  job_not_startable: 'Jobは既に終了しています',
  job_owner_required: 'Jobを停止・再実行できるのは、作成者かProject adminだけです',
  invalid_job: 'Jobの実行設定を確認できません',
  chain_too_deep: (details) => `Jobの連鎖は${shown(details.limit)}段までです`,
  child_job_limit: (details) =>
    `子Jobは1つの親につき${shown(details.limit)}件、同時に${shown(details.activeLimit)}件までです`,
  child_jobs_not_allowed: 'このJobは子Jobを作成できません',
  local_executor_disabled: 'Local executorは無効です',
  image_platform_mismatch: (details) =>
    `imageは${shown(details.cpuArch)}向けに作られていません（${shown(details.platforms) || '不明'}）`,
  image_registry_unavailable: 'imageのregistryに問い合わせられないため、CPUの対応を確認できません',
  source_run_deleted: '削除済みのRunには出力モデルや学習データを記録できません',
  source_run_required: 'Runの作成者として登録するにはsourceRunIdが必要です',
  // コンピュータと site
  target_admin_required: '全体管理者でない人が持てるコンピュータはsiteだけです',
  target_check_in_progress: 'このコンピュータの接続確認は実行中です',
  target_check_worker_unavailable: '選んだworkerはオンラインでないか、接続確認を受けられないバージョンです',
  target_connection_required: 'SSHのhostとusernameが必要です',
  target_not_available: 'このコンピュータはPrivateです。所有者と、所有者が作ったService AccountのJobだけが動きます',
  target_owner_required: 'このコンピュータの設定は所有者か全体管理者だけが変えられます',
  target_required: '実行するコンピュータを指定してください',
  target_setup_incomplete: '有効にするには作業ディレクトリとPython実行パスが必要です',
  site_account_required:
    'このコンピュータは本人のアカウントで動きます。コンピュータの「自分の設定」でアカウント名を登録してください',
  site_check_in_progress: 'このアカウントの接続確認は実行中です',
  site_check_unavailable: 'launcherがまだ鍵を作っていません。launcherが動いているか確かめてください',
  site_check_unsupported: 'siteにはtrackingから接続しないため、接続確認はできません',
  site_gpu_ids: 'siteではGPU IDを指定できません（gpuCountで数を指定します）',
  site_job_shell_missing: 'このコンピュータにはjob shellがありません',
  site_key_unavailable: 'このコンピュータでは鍵を使えません。自動投入のsiteで、先に「自分の設定」でアカウント名を登録してください',
  site_launcher_invalid: '選んだlauncherはありません（失効しています）',
  site_launcher_missing: 'このコンピュータを投入するlauncherがありません',
  site_not_manual: 'このsiteはlauncherが投入します（手動投入のsiteではありません）',
  site_only_setting: 'siteだけの設定です',
  site_owner_required: '全員のJobを投入できるのは、このコンピュータの所有者だけです',
  site_settings_invalid: 'siteの設定を確認してください',
  site_submission_unready: 'このコンピュータはまだJobを投入できません。job shell・launcher・作業ディレクトリ・アカウント名を確認してください',
  site_target_required: 'arrayはsiteでだけ実行できます',
  site_target_settings:
    'siteには接続設定・GPU ID・python runtimeを登録できません（runtimeはコンテナ、datasetTransferはdirect）',
  ssh_config_required: 'SSHのコンピュータには鍵とknown_hostsのパスが必要です',
  unknown_gpu: 'コンピュータに存在しないGPUが指定されています',
  directory_listing_limit: 'このコンピュータで待っているディレクトリの読み取りが多すぎます',
  launcher_name_taken: '同じ名前のlauncherがあります',
  // フック
  hook_disabled: 'フックが無効です',
  hook_not_manual: '手動で起動できるのはtriggerがmanualのフックだけです',
  hook_secret_key_missing: 'webhookのフックにはMMT_HOOK_SECRET_KEYの設定が必要です',
  invalid_hook_owner: '移管先は同じプロジェクトの有効なService Account（role editorかadmin）にしてください',
  invalid_signature: '署名が一致しません',
  // ワークフローと Task
  workflow_control_forbidden: 'ワークフローの実行を停止・再開できるのは、作成者かProject adminだけです',
  workflow_inputs_limit: '入力データセットの数が上限を超えています',
  workflow_launch_mismatch: '同じ起動キーに異なる設定が指定されています',
  workflow_model_output_required: 'モデルの入力元には出力モデルが一つ必要です',
  workflow_model_source_unregistered: (details) =>
    `モデルの入力元「${shown(details.modelSource)}」のTaskに、成功時に出力モデルを登録する設定がありません`,
  workflow_outputs_ambiguous: '同じ名前の出力データセットが複数あります。出力を一つにしてください',
  workflow_outputs_missing: '指定した出力データセットがありません',
  workflow_owner_unavailable: '実行した利用者の権限が無効になっています',
  workflow_quality_metric_unknown: (details) =>
    `前処理の指標「${shown(details.metric)}」はありません。前処理のレポートから計算した指標だけを使えます`,
  workflow_resume_invalid: '同じバージョンの失敗・停止した実行から再開してください',
  workflow_retry_required: 'ワークフローの実行画面から再開してください',
  workflow_revision_conflict: 'ワークフローが更新されています。最新のバージョンを開いてください',
  workflow_run_fixed: 'ワークフローの実行設定は固定されています。新しいバージョンを作成してください',
  workflow_source_not_finished: '入力元のステップが完了していません',
  workflow_source_order: '入力は先に実行するステップの出力を指定してください',
  workflow_step_duplicate: 'ステップのkeyは重複できません',
  task_revision_changed: 'Sweepの作成後にTaskが更新されたため再開できません。新しいSweepを作成してください',
  task_revision_conflict: 'Taskが更新されています。最新の設定を確認してから保存してください',
  // Sweep
  sweep_early_terminate_invalid: sweepEarlyTerminateInvalid,
  sweep_finished: '終了したSweepは変更できません',
  sweep_max_trials_below_created: (details) =>
    `maxTrialsは作成済みの試行数（${shown(details.createdTrials)}）以上にしてください`,
  sweep_owner_forbidden: 'Sweepの作成者にProjectのeditor権限がないため再開できません',
  sweep_owner_required: 'Sweepを操作できるのは作成者かProject adminだけです',
  // レポート、保存ビュー、コメント
  report_archived: 'アーカイブ済みのレポートは編集できません。先にアーカイブを解除してください',
  report_block_id_duplicate: 'ブロックのidが重複しています',
  report_blocks_too_large: 'レポートの内容が1MiBを超えています',
  report_owner_required: 'レポートのアーカイブと解除ができるのは作成者かProject管理者だけです',
  report_reference_invalid: 'レポートが参照するRun・Sweep・バージョン・保存ビュー・表がこのProjectにありません',
  report_revision_conflict: (details) =>
    `ほかの編集がバージョン${shown(details.currentRevision)}として保存されています。最新のバージョンを開き直してから編集してください`,
  report_saved_view_private: '非公開の保存ビューはレポートから参照できません。Projectに公開してから参照してください',
  report_snapshot_too_large: (details) =>
    hasDetail(details, 'blockId')
      ? `ブロック${shown(details.blockId)}の固定データが5MiBを超えます。Run集合や系列を絞るか、最新データで描く設定にしてください`
      : '1つのバージョンの固定データの合計が上限を超えます。固定するブロックを減らしてください',
  report_too_many_blocks: (details) => `レポートのブロックは${shown(details.limit)}個までです`,
  saved_view_experiment_not_found: '保存ビューのexperimentがこのProjectにありません',
  saved_view_filter_invalid: '保存ビューの検索条件が不正です',
  saved_view_name_conflict: '同じ名前の保存ビューが既にあります',
  saved_view_owner_required: '他人の保存ビューを変更・削除できるのはProject管理者だけです。公開範囲は作成者だけが変更できます',
  saved_view_share_forbidden: 'Project公開の保存ビューを作成・変更できるのはeditor以上です',
  saved_view_state_too_large: '保存ビューの状態が上限の64KiBを超えています',
  saved_view_state_unsupported_version: '保存ビューの状態のversionに対応していません',
  comment_author_required: 'コメントを編集できるのは作成者だけです',
  comment_delete_forbidden: 'コメントを削除できるのは作成者かProject管理者だけです',
  comment_deleted: '削除済みのコメントは編集できません',
  comment_parent_mismatch: '返信先のコメントは同じ対象に付いていません',
  comment_target_deleted: '削除済みの対象にはコメントできません',
  comment_target_unsupported: 'この種類の対象にはまだコメントできません',
  // 通知
  notification_channel_exists: '同じ名前の通知先が既にあります',
  notification_channel_invalid:
    '通知先の種類に合う設定を指定してください（Slackは urlEnv、Webhookは urlEnv と secretEnv、メールは recipients）',
  // 連携（mado S3 Data Catalog）
  plugin_capability_unsupported: '容量の読み取りがアクセストークンで許可されていません。許可した後に接続を確認し直してください',
  plugin_credentials_required: 'Madoのアクセストークンを設定してから有効にしてください',
  plugin_dataset_identity_mismatch: 'MadoのバージョンまたはNamespaceが一致しません',
  plugin_dataset_not_found: 'Madoのバージョンを参照できません',
  plugin_dataset_unavailable: 'このMadoバージョンには利用できる保存先がありません',
  plugin_delivery_identity_mismatch: '連携の送信先または内容が一致しません',
  plugin_disabled: '連携は無効です',
  plugin_job_namespace_not_allowed: (details) =>
    `RunのNamespace「${shown(details.namespace)}」をMadoのアクセストークンで許可してください`,
  plugin_mado_access_token_unsupported:
    'このMadoはアクセストークンの許可範囲の取得に対応していません。Madoを更新してください',
  plugin_request_failed: '連携先との通信に失敗しました',
  plugin_secret_decryption_failed: '保存済みの連携キーを復号できません。保存用の鍵を確認してください',
  plugin_secret_key_unavailable: '連携キーの保存用の鍵（MMT_PLUGIN_SECRET_KEY）がAPI serverに設定されていません',
  plugin_token_scope_missing: (details) =>
    `Madoのアクセストークンに${(Array.isArray(details.scopes) ? details.scopes : [])
      .map((scope: unknown) => MADO_SCOPE_LABELS[String(scope)] ?? String(scope))
      .join('と')}を許可してください`,
  plugin_token_unavailable: 'Madoのアクセストークンが未設定です',
  // Repository
  invalid_repository: 'RepositoryのURLまたはcommitが不正です',
  unsafe_repository: 'Repositoryに安全に読み込めないファイルがあります',
  repository_commit_mismatch: 'Repositoryのcommitが指定と一致しません',
  repository_read_failed: 'Repositoryを読み込めません',
  repository_timeout: 'Repositoryの読み込みがタイムアウトしました',
  repository_too_large: 'Repositoryのファイル数またはサイズが上限を超えています',
  // 前処理のレポート
  preprocessing_run_kind: '前処理のレポートはprocessing Runに記録してください',
  preprocessing_samples_invalid: '確認用サンプルはこのRunの保存済みArtifactを選んでください',
  // 想定外の失敗
  database_unavailable: 'データベースに接続できません',
  internal_error: 'リクエストの処理に失敗しました',
};
