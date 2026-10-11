import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ArtifactRangeError } from '@mmt/platform';
import { DomainError } from '../domain/errors.js';
import { MultipartUploadUnsupportedError } from './artifacts/multipartUnsupported.js';

interface MlflowErrorResponse {
  status: ContentfulStatusCode;
  body: { error_code: string; message: string };
}

const domainErrorCodes: Record<string, string> = {
  already_exists: 'RESOURCE_ALREADY_EXISTS',
  resource_already_exists: 'RESOURCE_ALREADY_EXISTS',
  not_found: 'RESOURCE_DOES_NOT_EXIST',
  resource_does_not_exist: 'RESOURCE_DOES_NOT_EXIST',
  invalid_parameter_value: 'INVALID_PARAMETER_VALUE',
  invalid_request: 'INVALID_PARAMETER_VALUE',
  invalid_json: 'MALFORMED_REQUEST',
  not_implemented: 'NOT_IMPLEMENTED',
  conflict: 'INVALID_STATE',
  body_too_large: 'REQUEST_LIMIT_EXCEEDED',
  artifact_too_large: 'RESOURCE_EXHAUSTED',
  // A protected alias cannot be changed through MLflow (it carries no reason or promotion decision).
  alias_protected: 'PERMISSION_DENIED',
};

// The native API's text speaks of signing in; an MLflow client is told which MLflow setting to fix.
const mlflowClientMessages: Record<string, string> = {
  authentication_required:
    'API tokenが送られていません。MLFLOW_TRACKING_TOKEN（Basic認証ならMLFLOW_TRACKING_PASSWORD）に、このProjectのAPI tokenを設定してください。tokenは［プロジェクト設定］の「SDK・MLflow 3から接続」で発行できます',
};

// The MLflow client appends /api/2.0/mlflow/... (or /api/3.0/..., .../mlflow-artifacts/...) to
// MLFLOW_TRACKING_URI. These paths arrive when the URI stops at the site, at /api or at
// /api/mlflow instead of a Project's /api/mlflow/projects/<id>.
const MLFLOW_PATH_WITHOUT_PROJECT =
  /^\/api\/(?:mlflow\/)?(?:api\/)?[0-9]+\.[0-9]+\/mlflow(?:-artifacts)?(?:\/|$)/;

export function isMlflowRequestWithoutProject(requestPath: string): boolean {
  return MLFLOW_PATH_WITHOUT_PROJECT.test(requestPath);
}

/** The answer to an MLflow call whose tracking URI has no Project, with the URI it should be. */
export function mlflowProjectMissingError(publicUrl: string): MlflowErrorResponse {
  return {
    status: 404,
    body: {
      error_code: 'ENDPOINT_NOT_FOUND',
      message: `MLFLOW_TRACKING_URIにProjectのIDが入っていません。${publicUrl}/api/mlflow/projects/<ProjectのID> にしてください。［プロジェクト設定］またはExperimentsの［SDKで記録］の「SDK・MLflow 3から接続」に、IDを入れたURIが表示されます`,
    },
  };
}

export function isMlflowRequest(requestPath: string): boolean {
  return /^\/api\/mlflow\/projects\/[^/]+(?:\/|$)/.test(requestPath);
}

/** Raw Artifact bytes: single-PUT transfers and multipart part PUTs. */
export function isMlflowArtifactUpload(request: { method: string; path: string }): boolean {
  return (
    request.method === 'PUT' &&
    /^\/api\/mlflow\/projects\/[^/]+\/api\/2\.0\/mlflow-artifacts\/(?:artifacts\/.+|mpu\/parts\/[^/]+\/[^/]+)$/.test(
      request.path,
    )
  );
}

export function formatMlflowError(error: Error): MlflowErrorResponse {
  // DomainError has no 501 status; the SDK needs exactly this status and message to fall back.
  if (error instanceof MultipartUploadUnsupportedError)
    return { status: 501, body: { error_code: 'NOT_IMPLEMENTED', message: error.message } };
  if (error instanceof DomainError) {
    const statusCode = error.status;
    const fallbackCode =
      statusCode === 401
        ? 'UNAUTHENTICATED'
        : statusCode === 403
          ? 'PERMISSION_DENIED'
          : statusCode === 404
            ? 'RESOURCE_DOES_NOT_EXIST'
            : statusCode === 409
              ? 'INVALID_STATE'
              : statusCode >= 500
                ? 'TEMPORARILY_UNAVAILABLE'
                : 'INVALID_PARAMETER_VALUE';
    return {
      status: statusCode,
      body: {
        error_code: domainErrorCodes[error.code] ?? fallbackCode,
        message: mlflowClientMessages[error.code] ?? error.message,
      },
    };
  }
  if (error instanceof ArtifactRangeError) {
    return {
      status: 416,
      body: { error_code: 'INVALID_PARAMETER_VALUE', message: '要求されたRangeは読み込めません' },
    };
  }
  const databaseCode = (error as { code?: string }).code;
  if (databaseCode === '23505') {
    return {
      status: 409,
      body: {
        error_code: 'RESOURCE_ALREADY_EXISTS',
        message: '同じ名前またはバージョンが既に登録されています',
      },
    };
  }
  if (['23503', '23514', '22P02'].includes(databaseCode ?? '')) {
    return {
      status: 400,
      body: { error_code: 'INVALID_PARAMETER_VALUE', message: '参照または入力値が不正です' },
    };
  }
  return {
    status: 503,
    body: { error_code: 'TEMPORARILY_UNAVAILABLE', message: 'リクエストの処理に失敗しました' },
  };
}
