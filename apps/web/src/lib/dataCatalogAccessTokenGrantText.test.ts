import { describe, expect, it } from 'vitest';
import type { DataCatalogAccessTokenGrant } from '@mmt/contracts';
import {
  canReadCapacity,
  formatAccessTokenExpiry,
  formatAccessTokenPermissions,
} from './dataCatalogAccessTokenGrantText';

const GRANT: DataCatalogAccessTokenGrant = {
  name: 'ML Tracking',
  scopes: ['metrics:read'],
  expiresAt: null,
};

describe('mado S3 Data Catalogのアクセストークンの許可範囲の表示', () => {
  it('容量の読み取りは機能の名前で、ほかの操作はmado S3 Data Catalogでの名前のまま並べる', () => {
    expect(formatAccessTokenPermissions(GRANT)).toBe('Capacityの読み取り');
    expect(formatAccessTokenPermissions({ ...GRANT, scopes: ['lineage:read', 'metrics:read'] }))
      .toBe('lineage:read、Capacityの読み取り');
  });

  it('何も許可していないトークンは、空欄ではなく許可が無いと示す', () => {
    expect(formatAccessTokenPermissions({ ...GRANT, scopes: [] })).toBe('なし');
  });

  it('有効期限のないトークンは無期限と示す', () => {
    expect(formatAccessTokenExpiry(GRANT)).toBe('無期限');
    expect(formatAccessTokenExpiry({ ...GRANT, expiresAt: '2027-01-01T00:00:00.000Z' })).not.toBe('無期限');
  });

  it('容量を読めるのは、Capacityの読み取りを許可したトークンだけ', () => {
    expect(canReadCapacity(GRANT)).toBe(true);
    expect(canReadCapacity({ ...GRANT, scopes: ['lineage:read'] })).toBe(false);
  });
});
