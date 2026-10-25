import type { ApiErrorCode } from '@mmt/contracts';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ArtifactRangeError } from '@mmt/platform';
import { DomainError } from '../domain/errors.js';
import { MultipartUploadUnsupportedError } from './artifacts/multipartUnsupported.js';

interface MlflowErrorResponse {
  status: ContentfulStatusCode;
  body: { error_code: string; message: string };
}

// 独自 API の code に対応する MLflow の error_code。無い code は HTTP status から選ぶ。
const domainErrorCodes: Partial<Record<ApiErrorCode, string>> = {
  already_exists: 'RESOURCE_ALREADY_EXISTS',
  not_found: 'RESOURCE_DOES_NOT_EXIST',
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
const mlflowClientMessages: Partial<Record<ApiErrorCode, string>> = {
  authentication_required:
    'no API token was sent; set MLFLOW_TRACKING_TOKEN (MLFLOW_TRACKING_PASSWORD for Basic authentication) to an API token of this project. Issue one under "Connect from SDK or MLflow 3" in Project settings',
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
      message: `MLFLOW_TRACKING_URI does not contain a project ID; use ${publicUrl}/api/mlflow/projects/<project ID>. The URI with the ID is shown under "Connect from SDK or MLflow 3" in Project settings, or in "Record with SDK" on the Experiments page`,
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
      body: { error_code: 'INVALID_PARAMETER_VALUE', message: 'the requested range is not satisfiable' },
    };
  }
  const databaseCode = (error as { code?: string }).code;
  if (databaseCode === '23505') {
    return {
      status: 409,
      body: {
        error_code: 'RESOURCE_ALREADY_EXISTS',
        message: 'the same name or version is already registered',
      },
    };
  }
  if (['23503', '23514', '22P02'].includes(databaseCode ?? '')) {
    return {
      status: 400,
      body: { error_code: 'INVALID_PARAMETER_VALUE', message: 'invalid reference or input value' },
    };
  }
  return {
    status: 503,
    body: { error_code: 'TEMPORARILY_UNAVAILABLE', message: 'failed to process the request' },
  };
}
