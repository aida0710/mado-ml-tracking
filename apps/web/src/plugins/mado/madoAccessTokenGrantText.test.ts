import { describe, expect, it } from 'vitest';
import type { MadoAccessTokenGrant } from '@mmt/contracts';
import { formatMadoTokenExpiry, formatMadoTokenPermissions } from './madoAccessTokenGrantText';

const GRANT: MadoAccessTokenGrant = { name: 'ML Tracking', scopes: ['metrics:read'], expiresAt: null };

describe('Madoのアクセストークンの許可範囲の表示', () => {
  it('容量の読み取りはMadoの機能別の名前で、ほかの操作はMadoの名前のまま並べる', () => {
    expect(formatMadoTokenPermissions(GRANT)).toBe('Capacityの読み取り');
    expect(formatMadoTokenPermissions({ ...GRANT, scopes: ['lineage:read', 'metrics:read'] }))
      .toBe('lineage:read、Capacityの読み取り');
  });

  it('何も許可していないトークンは、空欄ではなく許可が無いと示す', () => {
    expect(formatMadoTokenPermissions({ ...GRANT, scopes: [] })).toBe('なし');
  });

  it('有効期限のないトークンは無期限と示す', () => {
    expect(formatMadoTokenExpiry(GRANT)).toBe('無期限');
    expect(formatMadoTokenExpiry({ ...GRANT, expiresAt: '2027-01-01T00:00:00.000Z' })).not.toBe('無期限');
  });
});
