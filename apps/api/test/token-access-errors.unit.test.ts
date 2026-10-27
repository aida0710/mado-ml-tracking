import { describe, expect, it } from 'vitest';
import { scopeRequiredError } from '../src/domain/tokenAccessErrors.js';

describe('scopeRequiredError', () => {
  it('workerのtokenにartifacts:writeが足りないと、記録用ではなくworker用の発行を勧める', () => {
    const error = scopeRequiredError('artifacts:write', ['read', 'worker:execute']);
    expect(error.details).toMatchObject({ scope: 'artifacts:write', purpose: 'worker' });
    expect(error.message).toContain('"Run jobs as a worker" (scopes: read, worker:execute, artifacts:write)');
  });

  it('今のscopeを含む用途が無ければ、足りないscopeを含む最初の用途を勧める', () => {
    const error = scopeRequiredError('artifacts:write', ['jobs:write']);
    expect(error.details).toMatchObject({ purpose: 'recording' });
  });

  it('全体のscopeは、Projectを選ばずに全体管理者が発行するよう伝える', () => {
    const error = scopeRequiredError('audit:read', ['read']);
    expect(error.details).toMatchObject({ purpose: null });
    expect(error.message).toContain('global administrator');
  });
});
