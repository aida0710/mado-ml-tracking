import type { ServerOptions } from 'node:http';
import type { ApiConfig } from '../config.js';

// Slowlorisへの対策。何時間もかかるArtifactのアップロードのためにリクエスト全体の期限を
// 無効にしていても、クライアントはこの時間内にヘッダーを送り終えなければならない。
const HEADERS_TIMEOUT_MS = 60_000;

export interface ServerTimeouts {
  serverOptions: Pick<ServerOptions, 'requestTimeout' | 'headersTimeout'>;
  /** ソケットの無通信の上限。止まったアップロードは、接続を持ち続けずに切る。 */
  idleTimeoutMs: number;
}

export function serverTimeouts(
  config: Pick<ApiConfig, 'uploadRequestTimeoutMs' | 'uploadIdleTimeoutMs'>,
): ServerTimeouts {
  const requestTimeout = config.uploadRequestTimeoutMs;
  return {
    serverOptions: {
      requestTimeout,
      // Nodeは、0でないリクエストのタイムアウトより長いヘッダーのタイムアウトを拒む。
      headersTimeout:
        requestTimeout > 0 ? Math.min(HEADERS_TIMEOUT_MS, requestTimeout) : HEADERS_TIMEOUT_MS,
    },
    idleTimeoutMs: config.uploadIdleTimeoutMs,
  };
}

export function applyIdleTimeout(
  server: { setTimeout(milliseconds: number): unknown },
  timeouts: ServerTimeouts,
) {
  // 'timeout'のリスナーが無いとNodeは無通信のソケットを破棄し、アップロードのストリームも中断する。
  server.setTimeout(timeouts.idleTimeoutMs);
}
