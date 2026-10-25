import type { z } from 'zod';
import type { ProjectRole, TokenScope } from '@mmt/contracts';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * 誰が経路を呼べるか。サービスが検査するとおりに表す。OpenAPIでは操作ごとに示し
 * （`x-mmt-access`）、そこから一般的な401・403の応答を導く。
 */
export type RouteAccess =
  // 認証なし: health、認証の設定、ログインの流れ。
  | { kind: 'public' }
  // サインインしたどのユーザーでもよい。API tokenには`scope`も要る。
  | { kind: 'signedIn'; scope: TokenScope }
  // どのユーザーのブラウザのsessionでもよい（API tokenは403 session_required）。
  | { kind: 'session' }
  // 実効のProjectのrole（直接の付与かグループの割り当て）と、API tokenではscope。
  | { kind: 'project'; role: ProjectRole; scope: TokenScope }
  // 全体管理者。API tokenには`admin`が要り、Projectの制限が無く、指定があれば`scope`も
  // 要る（`admin`には含まれない）。sessionOnly: API tokenは403 session_required。
  | { kind: 'globalAdmin'; scope?: TokenScope; sessionOnly?: boolean }
  // `worker:execute`を持つ、Projectに結びついたAPI token（workerのプロセス）。
  | { kind: 'worker' }
  // 画面で登録したlauncherのtoken（`launcher:execute`）。sessionは403。
  | { kind: 'launcher' }
  // path の Job の Job token（mado_mtj_）。site の runner か、Job の中のドライバーのコード。
  | { kind: 'jobToken' }
  // リクエストした本人のAPI tokenで`scope`を持つもの。ブラウザのsessionとJob tokenは403。
  | { kind: 'apiToken'; scope: TokenScope };

/** JSONでない本文。生のバイト列、CSV、リダイレクト先。 */
export interface NonJsonContent {
  contentType: string;
  description: string;
}

export type SuccessStatus = 200 | 201 | 202 | 204 | 206 | 302 | 304;
export type ResponseContent = z.ZodType | NonJsonContent | null;

/** アクセスと入力から導かれる一般的なもの以外に、その経路が文書化するエラー。 */
export interface RouteError {
  status: number;
  code: string;
}

/**
 * 1つのネイティブの経路。パスはアプリのHonoのテンプレート（`/api/projects/:p/runs/:r`）を使い、
 * coverageのテストが変換なしで`app.routes`と比べられるようにする。
 */
export interface NativeRoute {
  method: HttpMethod;
  path: string;
  tag: string;
  summary: string;
  access: RouteAccess;
  query?: z.ZodType;
  // 経路が読むリクエストヘッダー。ヘッダー名をキーにしたobjectのスキーマで表す。
  headers?: z.ZodType;
  body?: z.ZodType | NonJsonContent;
  // MAX_JSON_BODY_BYTES以外のJSONの本文の上限（requestBodyLimits.tsを参照）。
  maxBodyBytes?: number;
  // 本文は省略できる（空の本文は既定値を意味する）。Jobの再試行やaliasの削除がそう。
  bodyOptional?: boolean;
  responses: Partial<Record<SuccessStatus, ResponseContent>>;
  errors?: readonly RouteError[];
}

export const PROJECT_VIEWER: RouteAccess = { kind: 'project', role: 'viewer', scope: 'read' };
export const PROJECT_ADMIN: RouteAccess = { kind: 'project', role: 'admin', scope: 'admin' };
export const GLOBAL_ADMIN: RouteAccess = { kind: 'globalAdmin' };
export const WORKER: RouteAccess = { kind: 'worker' };
export const LAUNCHER: RouteAccess = { kind: 'launcher' };
export const JOB_TOKEN: RouteAccess = { kind: 'jobToken' };

export function projectEditor(scope: TokenScope): RouteAccess {
  return { kind: 'project', role: 'editor', scope };
}

export function routeError(status: number, ...codes: string[]): RouteError[] {
  return codes.map((code) => ({ status, code }));
}

export function isNonJsonContent(content: unknown): content is NonJsonContent {
  // zodのスキーマは内部を`_zod`の下に持つ。NonJsonContentはただのオブジェクト。
  return (
    typeof content === 'object' &&
    content !== null &&
    'contentType' in content &&
    !('_zod' in content)
  );
}
