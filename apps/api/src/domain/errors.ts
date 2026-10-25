import type { ApiErrorCode, ApiErrorDetails } from '@mmt/contracts';

export type DomainErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 416 | 422 | 429 | 502 | 503;

export interface DomainErrorInit {
  status: DomainErrorStatus;
  code: ApiErrorCode;
  /** ログや curl で人が読む英語の文。画面は code で訳すので、文を解析させない。 */
  message: string;
  /** 文に入る値。応答の本文で error・code の横に置く。 */
  details?: ApiErrorDetails;
}

/** 独自 API のエラー応答 `{ error, code, ...details }` になる失敗。MLflow 互換の経路では MLflow の形に直す。 */
export class DomainError extends Error {
  readonly status: DomainErrorStatus;
  readonly code: ApiErrorCode;
  readonly details: ApiErrorDetails;

  constructor({ status, code, message, details = {} }: DomainErrorInit) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** `resource` は文の主語にする英語の名前（'run'、'model version' など）。 */
export function notFound(resource: string): never {
  throw new DomainError({ status: 404, code: 'not_found', message: `${resource} not found` });
}

export function conflict(message: string, details?: ApiErrorDetails): never {
  throw new DomainError({ status: 409, code: 'conflict', message, details });
}
