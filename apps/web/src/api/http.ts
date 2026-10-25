// Client-side failure codes. They never come from the API and are translated in lib/errorMessage.ts.
export const NETWORK_ERROR_CODE = 'network_error';
export const INVALID_RESPONSE_CODE = 'invalid_response';
// A front proxy may answer 413 with HTML before the API sees the upload, so the client names it.
export const ARTIFACT_TOO_LARGE_CODE = 'artifact_too_large';
// Artifact content is fetched as raw bytes, so a failure carries no API error body to show.
export const ARTIFACT_CONTENT_UNAVAILABLE_CODE = 'artifact_content_unavailable';

/**
 * A failed API call. It carries only what the API (or the transport) reported;
 * lib/errorMessage.ts turns it into the text shown on screen.
 */
export class RequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  /** API の英語の文（本文の `error`）。 */
  readonly serverMessage: string | undefined;
  /** 本文の error・code の横の項目。文に入る値で、画面はこれを読んで訳す。 */
  readonly details: Readonly<Record<string, unknown>>;

  constructor({
    status,
    code,
    serverMessage,
    details = {},
  }: {
    status: number;
    code?: string;
    serverMessage?: string;
    details?: Readonly<Record<string, unknown>>;
  }) {
    super(serverMessage ?? `Request failed: ${code ?? `HTTP ${status}`}`);
    this.name = 'RequestError';
    this.status = status;
    this.code = code;
    this.serverMessage = serverMessage;
    this.details = details;
  }
}

/**
 * API のエラー応答の本文（`{ error, code, ...details }`）から RequestError を作る。API の形でない本文
 * （手前の proxy の HTML、空の本文）なら status だけを持つ。
 */
export function requestErrorFromBody(status: number, body: unknown): RequestError {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return new RequestError({ status });
  const { error, code, ...details } = body as Record<string, unknown>;
  return new RequestError({
    status,
    code: typeof code === 'string' ? code : undefined,
    serverMessage: typeof error === 'string' ? error : undefined,
    details,
  });
}

export function invalidResponseError(status = 200): RequestError {
  return new RequestError({ status, code: INVALID_RESPONSE_CODE });
}

const HTTP_NOT_FOUND = 404;

/** Whether the API answered 404: the thing is gone, belongs elsewhere, or is hidden from the user. */
export function isNotFoundError(failure: unknown): boolean {
  return failure instanceof RequestError && failure.status === HTTP_NOT_FOUND;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, credentials: 'include' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new RequestError({ status: 0, code: NETWORK_ERROR_CODE });
  }
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw requestErrorFromBody(response.status, payload);
  if (payload === null) throw invalidResponseError(response.status);
  return payload as T;
}

// Cursor-paged responses carry the page items and the id to continue from (null on the last page).
export function assertCursorPage(page: { items: unknown; nextCursor: unknown }): void {
  if (!Array.isArray(page.items) || (page.nextCursor !== null && typeof page.nextCursor !== 'string'))
    throw invalidResponseError();
}

export async function requestItems<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const payload = await request<{ items: T[] }>(path, { signal });
  if (!Array.isArray(payload.items)) throw invalidResponseError();
  return payload.items;
}

export function jsonRequest(method: 'POST' | 'PATCH' | 'PUT', body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const encodeId = encodeURIComponent;
export const projectPath = (projectId: string) => `/projects/${encodeId(projectId)}`;
