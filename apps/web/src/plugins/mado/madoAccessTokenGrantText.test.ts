import { describe, expect, it } from 'vitest';
import type { MadoAccessTokenGrant } from '@mmt/contracts';
import { formatMadoTokenExpiry, formatMadoTokenNamespaces, formatMadoTokenPermissions } from './madoAccessTokenGrantText';

const GRANT: MadoAccessTokenGrant = {
  name: 'ML Tracking', scopes: ['lineage:read', 'lineage:write', 'metrics:read'],
  namespaces: ['speech', 'mado-model-tracking'], expiresAt: null,
};

describe('Madoのアクセストークンの許可範囲の表示', () => {
  it('許可された操作をMadoの機能別の名前で並べ、知らない操作はMadoの名前のまま出す', () => {
    expect(formatMadoTokenPermissions(GRANT)).toBe('DataLineageの読み取り、DataLineageの送信、Capacityの読み取り');
    expect(formatMadoTokenPermissions({ ...GRANT, scopes: ['lineage:read', 'storage:write'] }))
      .toBe('DataLineageの読み取り、storage:write');
  });

  it('全Namespaceを許可したトークンは「*」ではなく、すべてのNamespaceと示す', () => {
    expect(formatMadoTokenNamespaces(GRANT)).toBe('speech、mado-model-tracking');
    expect(formatMadoTokenNamespaces({ ...GRANT, namespaces: ['*'] })).toBe('すべてのNamespace');
  });

  it('有効期限のないトークンは無期限と示す', () => {
    expect(formatMadoTokenExpiry(GRANT)).toBe('無期限');
    expect(formatMadoTokenExpiry({ ...GRANT, expiresAt: '2027-01-01T00:00:00.000Z' })).not.toBe('無期限');
  });
});
