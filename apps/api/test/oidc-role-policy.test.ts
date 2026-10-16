import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { TEST_SESSION_ENCRYPTION_KEY } from './mockOidcProvider.js';
import { removesLastGlobalAdmin } from '../src/domain/globalAdminInvariant.js';
import {
  createOidcRolePolicy,
  resolveOidcAccess,
  type OidcRolePolicy,
} from '../src/domain/oidcRolePolicy.js';

const policy: OidcRolePolicy = {
  allowedGroups: ['mmt-users', 'mmt-admins'],
  roleMapping: { 'mmt-admins': 'admin', 'mmt-users': 'user' },
  defaultRole: 'user',
};

describe('resolveOidcAccess', () => {
  it('許可groupに1つも入っていなければ拒否する', () => {
    expect(resolveOidcAccess(policy, ['other'])).toEqual({ allowed: false, groups: ['other'] });
    expect(resolveOidcAccess(policy, []).allowed).toBe(false);
  });

  it('複数groupに該当すると強い方のroleになり、groupは重複を除いて並べ替える', () => {
    expect(resolveOidcAccess(policy, ['mmt-users', 'mmt-admins', 'mmt-users'])).toEqual({
      allowed: true,
      globalRole: 'admin',
      isAdmin: true,
      groups: ['mmt-admins', 'mmt-users'],
    });
  });

  it('対応表に無い許可ユーザーはOIDC_DEFAULT_ROLEになる', () => {
    const withoutUserMapping = { ...policy, roleMapping: { 'mmt-admins': 'admin' as const } };
    expect(resolveOidcAccess(withoutUserMapping, ['mmt-users'])).toMatchObject({
      globalRole: 'user',
      isAdmin: false,
    });
    expect(
      resolveOidcAccess({ ...withoutUserMapping, defaultRole: 'admin' }, ['mmt-users']),
    ).toMatchObject({ globalRole: 'admin', isAdmin: true });
  });

  it('文字列でない・空・長すぎるgroupは判定にも保存にも使わない', () => {
    expect(resolveOidcAccess(policy, ['mmt-users', 1, '', 'x'.repeat(257), null])).toMatchObject({
      allowed: true,
      groups: ['mmt-users'],
    });
  });
});

describe('createOidcRolePolicy', () => {
  const base = {
    allowedGroups: 'mmt-users, mmt-admins',
    roleMappingJson: undefined,
    defaultRole: undefined,

  };

  it('OIDC_ALLOWED_GROUPSが空なら作れない', () => {
    expect(() => createOidcRolePolicy({ ...base, allowedGroups: undefined })).toThrow(
      /OIDC_ALLOWED_GROUPS/,
    );
    expect(() => createOidcRolePolicy({ ...base, allowedGroups: ' , ' })).toThrow(
      /OIDC_ALLOWED_GROUPS/,
    );
  });

  it('対応表が無いとmmt-adminsも一般ユーザーになる', () => {
    const configured = createOidcRolePolicy(base);
    expect(configured.roleMapping).toEqual({});
    expect(resolveOidcAccess(configured, ['mmt-admins'])).toMatchObject({ isAdmin: false });
  });

  it('対応表で明示したgroupだけが管理者になる', () => {
    const configured = createOidcRolePolicy({ ...base, roleMappingJson: '{"ops":"admin"}' });
    expect(resolveOidcAccess(configured, ['mmt-users', 'ops'])).toMatchObject({ isAdmin: true });
    expect(resolveOidcAccess(configured, ['mmt-admins'])).toMatchObject({ isAdmin: false });
  });

  it('未知のroleや壊れたJSONは作れない', () => {
    expect(() => createOidcRolePolicy({ ...base, roleMappingJson: '{"ops":"owner"}' })).toThrow(
      /OIDC_ROLE_MAPPING_JSON roles/,
    );
    for (const roleMappingJson of ['not json', '[]', '"admin"', 'null'])
      expect(() => createOidcRolePolicy({ ...base, roleMappingJson })).toThrow(
        /OIDC_ROLE_MAPPING_JSON/,
      );
    expect(() => createOidcRolePolicy({ ...base, defaultRole: 'viewer' })).toThrow(
      /OIDC_DEFAULT_ROLE/,
    );
  });
});

describe('removesLastGlobalAdmin', () => {
  it('ほかに有効な全体管理者がいなくなる変更だけを検出する', () => {
    expect(removesLastGlobalAdmin(['a'], { userId: 'a', isAdmin: false })).toBe(true);
    expect(removesLastGlobalAdmin(['a'], { userId: 'a', status: 'disabled' })).toBe(true);
    expect(removesLastGlobalAdmin(['a', 'b'], { userId: 'a', isAdmin: false })).toBe(false);
    expect(removesLastGlobalAdmin(['a'], { userId: 'a', isAdmin: true })).toBe(false);
    expect(removesLastGlobalAdmin(['b'], { userId: 'a', isAdmin: false })).toBe(false);
    expect(removesLastGlobalAdmin([], { userId: 'a', isAdmin: false })).toBe(false);
  });
});

describe('OIDCの起動設定', () => {
  const oidcEnvironment = {
    MMT_DATABASE_URL: 'postgresql://mmt@127.0.0.1:1/mmt_test',
    AUTH_MODE: 'oidc',
    OIDC_ISSUER_URL: 'https://sso.example.test/application/o/mmt/',
    OIDC_CLIENT_ID: 'mmt',
    OIDC_ALLOWED_GROUPS: 'mmt-users,mmt-admins',
    MMT_SESSION_ENCRYPTION_KEY: TEST_SESSION_ENCRYPTION_KEY,
  };

  it('oidcとhybridはOIDC_ALLOWED_GROUPSが無いと起動しない。localは読まない', () => {
    for (const AUTH_MODE of ['oidc', 'hybrid'])
      expect(() => loadConfig({ ...oidcEnvironment, AUTH_MODE, OIDC_ALLOWED_GROUPS: '' })).toThrow(
        /OIDC_ALLOWED_GROUPS/,
      );
    expect(
      loadConfig({ ...oidcEnvironment, AUTH_MODE: 'local', OIDC_ALLOWED_GROUPS: '' }).oidc,
    ).toBeNull();
  });

  it('OIDC_ADMIN_GROUPを指定すると設定エラーになる', () => {
    expect(() =>
      loadConfig({
        ...oidcEnvironment,
        OIDC_ADMIN_GROUP: 'mmt-admins',
        OIDC_ROLE_MAPPING_JSON: '{"ops":"admin"}',
      }),
    ).toThrow(/OIDC_ADMIN_GROUP/);
  });

  it('自動連携は既定で無効、refresh tokenを要求し、openidの無いscopeは拒否する', () => {
    const config = loadConfig(oidcEnvironment);
    expect(config.oidc).toMatchObject({
      autoLinkVerifiedEmail: false,
      scopes: 'openid profile email offline_access',
      rolePolicy: { roleMapping: {}, defaultRole: 'user' },
    });
    expect(() => loadConfig({ ...oidcEnvironment, OIDC_SCOPES: 'profile email' })).toThrow(
      /OIDC_SCOPES/,
    );
  });
});
