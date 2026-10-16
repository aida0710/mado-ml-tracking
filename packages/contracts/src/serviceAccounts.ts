import type { ProjectRole } from './index.js';

/** Scopes an API token can hold, in the order screens list them. */
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
 * Scopes that `admin` does not include: a token holds them only when they are named. They let a
 * token issue credentials, read the whole audit log or manage accounts, so an existing `admin`
 * token does not gain them, and a token cannot grant them onward unless it holds them itself.
 */
export const EXPLICIT_TOKEN_SCOPES: readonly TokenScope[] = ['tokens:manage', 'audit:read', 'users:manage'];

/**
 * Scopes for operations over the whole server. Only a global administrator's token without a
 * Project restriction may hold them; a Project-bound token would have nothing to use them on.
 */
export const GLOBAL_TOKEN_SCOPES: readonly TokenScope[] = ['audit:read', 'users:manage'];

/**
 * The Project role a token's owner needs to hold a scope. The API checks it when a token is
 * issued; screens use it to offer only the scopes the owner can receive.
 */
export const TOKEN_SCOPE_REQUIRED_ROLE: Record<TokenScope, ProjectRole> = {
  read: 'viewer',
  'runs:write': 'editor',
  'registry:write': 'editor',
  'artifacts:write': 'editor',
  'jobs:write': 'editor',
  'worker:execute': 'admin',
  admin: 'admin',
  // A token manages only tokens within its own scopes, so holding this needs no stronger role.
  'tokens:manage': 'viewer',
  'audit:read': 'admin',
  'users:manage': 'admin',
};

/**
 * An account that belongs to a Project instead of a person (users.kind='service'). Its tokens
 * keep working when the people who issued them leave the Project. `role` is its direct Project
 * grant, null when the grant was removed through the members API.
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
  /** Explicit null never expires; omission uses the server's default lifetime. */
  expiresAt?: string | null;
}
