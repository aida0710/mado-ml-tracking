import type { ProjectRole } from './index.js';

/** API tokenが持てるscope。画面が並べる順。 */
export const TOKEN_SCOPES = [
  'read',
  'runs:write',
  'registry:write',
  'artifacts:write',
  'jobs:write',
  'worker:execute',
  'admin',
  'tokens:manage',
  'audit:read',
  'users:manage',
] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

/**
 * `admin`に含まれないscope。名前を挙げたときだけtokenが持つ。認証情報の発行、監査ログ全体の
 * 読み取り、アカウントの管理ができるので、既存の`admin`のtokenがこれらを得ることはなく、
 * token自身が持っていなければ、ほかへ与えることもできない。
 */
export const EXPLICIT_TOKEN_SCOPES: readonly TokenScope[] = ['tokens:manage', 'audit:read', 'users:manage'];

/**
 * サーバー全体に対する操作のscope。Projectの制限が無い、全体管理者のtokenだけが持てる。
 * Projectに縛られたtokenでは、これらを使う対象が無い。
 */
export const GLOBAL_TOKEN_SCOPES: readonly TokenScope[] = ['audit:read', 'users:manage'];

/**
 * tokenの所有者がscopeを持つのに必要なProjectのrole。APIはtokenの発行時にこれを確かめ、
 * 画面は所有者が受け取れるscopeだけを候補に出すのに使う。
 */
export const TOKEN_SCOPE_REQUIRED_ROLE: Record<TokenScope, ProjectRole> = {
  read: 'viewer',
  'runs:write': 'editor',
  'registry:write': 'editor',
  'artifacts:write': 'editor',
  'jobs:write': 'editor',
  'worker:execute': 'admin',
  admin: 'admin',
  // tokenは自分のscopeの範囲のtokenだけを管理するので、これを持つのに強いroleは要らない。
  'tokens:manage': 'viewer',
  'audit:read': 'admin',
  'users:manage': 'admin',
};

/**
 * 人ではなくProjectに属するアカウント（users.kind='service'）。発行した人がProjectを離れても、
 * そのtokenは使い続けられる。`role`はProjectでの直接の付与で、membersのAPIで付与を外した
 * ときはnull。
 */
export interface ServiceAccount {
  id: string;
  projectId: string;
  name: string;
  description: string;
  role: ProjectRole | null;
  status: 'active' | 'disabled';
  createdAt: string;
}

export interface ServiceAccountCreate {
  name: string;
  description?: string;
  role: ProjectRole;
}

export interface ServiceAccountUpdate {
  description?: string;
  role?: ProjectRole;
  status?: 'active' | 'disabled';
}

export interface ServiceAccountTokenCreate {
  name: string;
  scopes: TokenScope[];
  /** 明示的にnullにすると期限が無い。省略するとサーバーの既定の有効期間を使う。 */
  expiresAt?: string | null;
}
