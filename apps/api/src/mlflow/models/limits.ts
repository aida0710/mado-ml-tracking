// Share the native registry's name limit so SDK and native names remain interchangeable.
export const MAX_MODEL_NAME_LENGTH = 200;
// MLflow's keys and tag values can include paths, long text, and serialized metadata.
export const MAX_MODEL_KEY_LENGTH = 250;
export const MAX_MODEL_VALUE_LENGTH = 8000;
// Bound batch work under the application's JSON body limit.
export const MAX_MODEL_KEY_VALUE_BATCH = 1000;
// Bound search parsing, sorting, and SQL parameter counts.
export const MAX_MODEL_FILTER_LENGTH = 10000;
export const MAX_MODEL_SEARCH_EXPERIMENTS = 1000;
export const MAX_MODEL_SEARCH_DATASETS = 100;
export const MAX_MODEL_ORDER_FIELDS = 20;
export const MAX_MODEL_ORDER_FIELD_LENGTH = 500;
// Keep each page bounded while preserving MLflow's usual 100 item default. A larger max_results
// is served page by page with next_page_token (see searchPagination.ts), not rejected.
export const MAX_MODEL_PAGE_SIZE = 1000;
export const DEFAULT_MODEL_PAGE_SIZE = 100;
// MLflow 3.17's server rejects a larger max_results with INVALID_PARAMETER_VALUE, and so does
// this API.
export const MLFLOW_MAX_REGISTERED_MODEL_RESULTS = 1000;
export const MLFLOW_MAX_MODEL_VERSION_RESULTS = 200_000;
// MLflow sets no upper bound for search_logged_models, so any safe integer is a valid request.
export const MLFLOW_MAX_LOGGED_MODEL_RESULTS = Number.MAX_SAFE_INTEGER;
export const MAX_MODEL_PAGE_TOKEN_LENGTH = 2000;
// Match the native URI limit and keep registry descriptions bounded independently of artifacts.
export const MAX_MODEL_URI_LENGTH = 4000;
export const MAX_MODEL_DESCRIPTION_LENGTH = 10000;
export const MAX_MODEL_DATASET_DIGEST_LENGTH = 1000;
// Eighteen digit numeric ordinals fit PostgreSQL bigint and are always returned as strings.
export const MAX_MODEL_VERSION_DIGITS = 18;
export const MAX_NUMERIC_MODEL_VERSION = 10n ** BigInt(MAX_MODEL_VERSION_DIGITS) - 1n;
// Official service_pb2.LoggedModelStatus numbers, also accepted by protobuf JSON parsers.
export const READY_LOGGED_MODEL_STATUS = 2;
export const FAILED_LOGGED_MODEL_STATUS = 3;
