// ネイティブのregistryと名前の上限をそろえ、SDKとネイティブの名前を相互に使えるようにする。
export const MAX_MODEL_NAME_LENGTH = 200;
// MLflowのキーとtagの値には、パス、長い文章、シリアライズしたメタデータが入りうる。
export const MAX_MODEL_KEY_LENGTH = 250;
export const MAX_MODEL_VALUE_LENGTH = 8000;
// アプリケーションのJSONの本文の上限に収まるよう、バッチの処理量を制限する。
export const MAX_MODEL_KEY_VALUE_BATCH = 1000;
// 検索の解析・並べ替え・SQLのパラメータの数を制限する。
export const MAX_MODEL_FILTER_LENGTH = 10000;
export const MAX_MODEL_SEARCH_EXPERIMENTS = 1000;
export const MAX_MODEL_SEARCH_DATASETS = 100;
export const MAX_MODEL_ORDER_FIELDS = 20;
export const MAX_MODEL_ORDER_FIELD_LENGTH = 500;
// MLflowのいつもの既定の100件を保ちつつ、各ページの大きさを制限する。これより大きい
// max_resultsは拒まず、next_page_tokenでページごとに返す（searchPagination.tsを参照）。
export const MAX_MODEL_PAGE_SIZE = 1000;
export const DEFAULT_MODEL_PAGE_SIZE = 100;
// MLflow 3.17のサーバーはこれより大きいmax_resultsをINVALID_PARAMETER_VALUEで拒み、
// このAPIも同じ。
export const MLFLOW_MAX_REGISTERED_MODEL_RESULTS = 1000;
export const MLFLOW_MAX_MODEL_VERSION_RESULTS = 200_000;
// MLflowはsearch_logged_modelsに上限を設けていないので、安全な整数ならどれも正しいリクエスト。
export const MLFLOW_MAX_LOGGED_MODEL_RESULTS = Number.MAX_SAFE_INTEGER;
export const MAX_MODEL_PAGE_TOKEN_LENGTH = 2000;
// ネイティブのURIの上限に合わせ、registryの説明にもArtifactとは別に上限を設ける。
export const MAX_MODEL_URI_LENGTH = 4000;
export const MAX_MODEL_DESCRIPTION_LENGTH = 10000;
export const MAX_MODEL_DATASET_DIGEST_LENGTH = 1000;
// 18桁の数値の番号はPostgreSQLのbigintに収まり、常に文字列で返す。
export const MAX_MODEL_VERSION_DIGITS = 18;
export const MAX_NUMERIC_MODEL_VERSION = 10n ** BigInt(MAX_MODEL_VERSION_DIGITS) - 1n;
// 公式のservice_pb2.LoggedModelStatusの番号。protobufのJSONパーサーも受け付ける。
export const READY_LOGGED_MODEL_STATUS = 2;
export const FAILED_LOGGED_MODEL_STATUS = 3;
