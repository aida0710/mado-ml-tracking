import { describe, expect, it } from 'vitest';
import { scopesAllowedForRole } from './tokenScopes';

describe('Roleで選べるtokenのscope', () => {
  it('viewerは読み取りとtoken管理、editorは書き込みまで、adminはProjectのscopeを全部選べる', () => {
    expect(scopesAllowedForRole('viewer')).toEqual(['read', 'tokens:manage']);
    expect(scopesAllowedForRole('editor')).toEqual([
      'read',
      'runs:write',
      'registry:write',
      'artifacts:write',
      'jobs:write',
      'tokens:manage',
    ]);
    expect(scopesAllowedForRole('admin')).toContain('worker:execute');
    expect(scopesAllowedForRole('admin')).toContain('admin');
  });

  it('全体の監査とユーザー管理は、Projectのtokenには選択肢として出さない', () => {
    expect(scopesAllowedForRole('admin')).not.toContain('audit:read');
    expect(scopesAllowedForRole('admin')).not.toContain('users:manage');
  });
});
