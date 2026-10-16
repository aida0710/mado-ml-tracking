import { describe, expect, it } from 'vitest';
import type { TokenSummary } from '@mmt/contracts';
import { countUsableTokens } from './projectArchiveImpact';

const NOW = Date.parse('2026-10-11T12:00:00Z');

function token(id: string, expiresAt: string | null): TokenSummary {
  return {
    id,
    name: id,
    kind: 'service',
    projectId: 'project-1',
    scopes: ['read', 'worker:execute'],
    expiresAt,
    lastUsedAt: null,
    createdAt: '2026-10-01T00:00:00Z',
    ownerType: 'service_account',
    ownerId: 'worker-account',
    ownerName: 'gpu-worker',
    tokenPrefix: 'mmt_abcdefgh',
  };
}

describe('アーカイブで止まるtoken', () => {
  it('期限の無いものと期限前のものを数え、期限切れは数えない', () => {
    const tokens = [
      token('forever', null),
      token('later', '2026-12-31T00:00:00Z'),
      token('expired', '2026-10-01T00:00:00Z'),
    ];
    expect(countUsableTokens(tokens, NOW)).toBe(2);
    expect(countUsableTokens([], NOW)).toBe(0);
  });
});
