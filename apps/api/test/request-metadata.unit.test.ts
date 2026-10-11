import { describe, expect, it } from 'vitest';
import { clientAddressOf } from '../src/http/requestMetadata.js';

describe('接続元のアドレス', () => {
  it('信頼するproxyが無ければX-Forwarded-Forを読まない', () => {
    expect(clientAddressOf({ socketAddress: '172.18.0.5', forwardedFor: '10.0.0.9', trustedProxyHops: 0 })).toBe(
      '172.18.0.5',
    );
  });

  it('nginxが右端に足した値を使い、clientが書いた左側は使わない', () => {
    expect(
      clientAddressOf({ socketAddress: '172.18.0.5', forwardedFor: '1.2.3.4, 10.0.10.160', trustedProxyHops: 1 }),
    ).toBe('10.0.10.160');
  });

  it('edgeとnginxの2段なら右から2番目を使う', () => {
    expect(
      clientAddressOf({
        socketAddress: '172.18.0.5',
        forwardedFor: '1.2.3.4, 203.0.113.7, 172.17.0.1',
        trustedProxyHops: 2,
      }),
    ).toBe('203.0.113.7');
  });

  it('段数より短いX-Forwarded-Forはsocketの接続元に戻す', () => {
    expect(clientAddressOf({ socketAddress: '172.18.0.5', forwardedFor: '10.0.10.160', trustedProxyHops: 2 })).toBe(
      '172.18.0.5',
    );
    expect(clientAddressOf({ socketAddress: '172.18.0.5', forwardedFor: undefined, trustedProxyHops: 1 })).toBe(
      '172.18.0.5',
    );
  });
});
