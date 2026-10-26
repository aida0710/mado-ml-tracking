import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { TEST_SESSION_ENCRYPTION_KEY } from './mockOidcProvider.js';
import { removesLastGlobalAdmin } from '../src/domain/globalAdminInvariant.js';
import {
  createOidcRolePolicy,
  idpManagesGlobalRole,
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
      managedRole: 'admin',
      groups: ['mmt-admins', 'mmt-users'],
    });
  });

  it('対応表に無い許可ユーザーはMMT_OIDC_DEFAULT_ROLEになる', () => {
    const withoutUserMapping = { ...policy, roleMapping: { 'mmt-admins': 'admin' as const } };
    expect(resolveOidcAccess(withoutUserMapping, ['mmt-users'])).toMatchObject({
      managedRole: 'user',
    });
    expect(
      resolveOidcAccess({ ...withoutUserMapping, defaultRole: 'admin' }, ['mmt-users']),
    ).toMatchObject({ managedRole: 'admin' });
  });

  it('対応表が空ならログインの可否だけを決め、roleは決めない', () => {
    const appManaged = { ...policy, roleMapping: {} };
    expect(idpManagesGlobalRole(appManaged)).toBe(false);
    expect(idpManagesGlobalRole(policy)).toBe(true);
    expect(resolveOidcAccess(appManaged, ['mmt-admins'])).toEqual({
      allowed: true,
      groups: ['mmt-admins'],
    });
    expect(resolveOidcAccess(appManaged, ['other']).allowed).toBe(false);
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

  it('MMT_OIDC_ALLOWED_GROUPSが空なら作れない', () => {
    expect(() => createOidcRolePolicy({ ...base, allowedGroups: undefined })).toThrow(
      /MMT_OIDC_ALLOWED_GROUPS/,
    );
    expect(() => createOidcRolePolicy({ ...base, allowedGroups: ' , ' })).toThrow(
      /MMT_OIDC_ALLOWED_GROUPS/,
    );
  });

  it('対応表が無いとグループの名前からroleを決めない（mmt-adminsでも管理者にならない）', () => {
    const configured = createOidcRolePolicy(base);
    expect(configured.roleMapping).toEqual({});
    expect(resolveOidcAccess(configured, ['mmt-admins'])).not.toHaveProperty('managedRole');
  });

  it('対応表で明示したgroupだけが管理者になる', () => {
    const configured = createOidcRolePolicy({ ...base, roleMappingJson: '{"ops":"admin"}' });
    expect(resolveOidcAccess(configured, ['mmt-users', 'ops'])).toMatchObject({
      managedRole: 'admin',
    });
    expect(resolveOidcAccess(configured, ['mmt-admins'])).toMatchObject({ managedRole: 'user' });
  });

  it('未知のroleや壊れたJSONは作れない', () => {
    expect(() => createOidcRolePolicy({ ...base, roleMappingJson: '{"ops":"owner"}' })).toThrow(
      /MMT_OIDC_ROLE_MAPPING_JSON roles/,
    );
    for (const roleMappingJson of ['not json', '[]', '"admin"', 'null'])
      expect(() => createOidcRolePolicy({ ...base, roleMappingJson })).toThrow(
        /MMT_OIDC_ROLE_MAPPING_JSON/,
      );
    expect(() => createOidcRolePolicy({ ...base, defaultRole: 'viewer' })).toThrow(
      /MMT_OIDC_DEFAULT_ROLE/,
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
    MMT_AUTH_MODE: 'oidc',
    MMT_OIDC_ISSUER_URL: 'https://sso.example.test/application/o/mmt/',
    MMT_OIDC_CLIENT_ID: 'mmt',
    MMT_OIDC_ALLOWED_GROUPS: 'mmt-users,mmt-admins',
    MMT_SESSION_ENCRYPTION_KEY: TEST_SESSION_ENCRYPTION_KEY,
  };

  it('oidcとhybridはMMT_OIDC_ALLOWED_GROUPSが無いと起動しない。localは読まない', () => {
    for (const MMT_AUTH_MODE of ['oidc', 'hybrid'])
      expect(() =>
        loadConfig({ ...oidcEnvironment, MMT_AUTH_MODE, MMT_OIDC_ALLOWED_GROUPS: '' }),
      ).toThrow(/MMT_OIDC_ALLOWED_GROUPS/);
    expect(
      loadConfig({ ...oidcEnvironment, MMT_AUTH_MODE: 'local', MMT_OIDC_ALLOWED_GROUPS: '' }).oidc,
    ).toBeNull();
  });

  it('自動連携は既定で無効、refresh tokenを要求し、openidの無いscopeは拒否する', () => {
    const config = loadConfig(oidcEnvironment);
    expect(config.oidc).toMatchObject({
      autoLinkVerifiedEmail: false,
      scopes: 'openid profile email offline_access',
      rolePolicy: { roleMapping: {}, defaultRole: 'user' },
    });
    expect(() => loadConfig({ ...oidcEnvironment, MMT_OIDC_SCOPES: 'profile email' })).toThrow(
      /MMT_OIDC_SCOPES/,
    );
  });
});
