import { describe, expect, it } from 'vitest';
import { TOKEN_PURPOSE_SCOPES } from '@mmt/contracts';
import {
  initialTokenScopeChoice,
  purposeForScopes,
  purposesForOwner,
  scopesForPurpose,
} from './tokenPurposes';

const person = (role: 'viewer' | 'editor' | 'admin') => ({ role, isServiceAccount: false });
const serviceAccount = (role: 'viewer' | 'editor' | 'admin') => ({ role, isServiceAccount: true });

describe('tokenの用途', () => {
  it('Roleで持てないscopeを含む用途は出さず、viewerは読み取りと自分で選ぶだけになる', () => {
    expect(purposesForOwner(person('viewer'))).toEqual(['readOnly', 'custom']);
    expect(purposesForOwner(person('editor'))).toEqual([
      'recording',
      'jobSubmission',
      'readOnly',
      'custom',
    ]);
  });

  it('workerの用途はAdminのService Accountにだけ出し、人のtokenには出さない', () => {
    expect(purposesForOwner(person('admin'))).not.toContain('worker');
    expect(purposesForOwner(serviceAccount('editor'))).not.toContain('worker');
    expect(purposesForOwner(serviceAccount('admin'))).toContain('worker');
  });

  it('何も指定されなければ、記録の用途（read だけでは SDK が 403 になる）で始まる', () => {
    expect(initialTokenScopeChoice({ owner: person('editor') })).toEqual({
      purpose: 'recording',
      scopes: [...TOKEN_PURPOSE_SCOPES.recording],
    });
    expect(initialTokenScopeChoice({ owner: person('viewer') })).toEqual({
      purpose: 'readOnly',
      scopes: ['read'],
    });
  });

  it('AdminのService Accountはworkerの用途で始まる', () => {
    expect(initialTokenScopeChoice({ owner: serviceAccount('admin') })).toEqual({
      purpose: 'worker',
      scopes: ['read', 'worker:execute', 'artifacts:write'],
    });
  });

  it('案内から渡されたscopeは用途に読み替え、Roleを超えるscopeは外す', () => {
    expect(
      initialTokenScopeChoice({ owner: person('editor'), initialScopes: ['jobs:write', 'read'] }),
    ).toEqual({ purpose: 'jobSubmission', scopes: ['jobs:write', 'read'] });
    expect(
      initialTokenScopeChoice({ owner: person('viewer'), initialScopes: TOKEN_PURPOSE_SCOPES.recording }),
    ).toEqual({ purpose: 'readOnly', scopes: ['read'] });
  });

  it('scopeを変えると、そのscopeとちょうど一致する用途に移り、無ければ自分で選ぶになる', () => {
    const purposes = purposesForOwner(person('admin'));
    expect(purposeForScopes(['artifacts:write', 'read', 'registry:write', 'runs:write'], purposes)).toBe(
      'recording',
    );
    expect(purposeForScopes(['read', 'runs:write'], purposes)).toBe('custom');
    expect(purposeForScopes([], purposes)).toBe('custom');
  });

  it('投入用のtokenは、Jobを取るjobs:writeと件数を読むreadで発行する', () => {
    expect(scopesForPurpose('jobSubmission', []).sort()).toEqual(['jobs:write', 'read']);
  });

  it('自分で選ぶに切り替えても、選んでいたscopeはそのまま残る', () => {
    expect(scopesForPurpose('custom', ['read', 'jobs:write'])).toEqual(['read', 'jobs:write']);
    expect(scopesForPurpose('readOnly', ['read', 'jobs:write'])).toEqual(['read']);
  });
});
