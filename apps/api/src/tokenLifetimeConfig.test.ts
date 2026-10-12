import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('token期限の既定日数の設定互換性', () => {
  // Config validation does not connect to this synthetic database.
  const environment = { AUTH_MODE: 'development', MMT_DATABASE_URL: 'postgresql://test@127.0.0.1:1/unused' };
  it('設定がなければ従来どおり365日になる', () => {
    expect(loadConfig(environment).tokenDefaultLifetimeDays).toBe(365);
  });
  it('旧上限の設定は期限省略時の既定日数に使う', () => {
    expect(loadConfig({ ...environment, MMT_TOKEN_MAX_LIFETIME_DAYS: '30' }).tokenDefaultLifetimeDays)
      .toBe(30);
  });
  it('新しい設定は旧設定より優先される', () => {
    expect(loadConfig({ ...environment, MMT_TOKEN_MAX_LIFETIME_DAYS: '30',
      MMT_TOKEN_DEFAULT_LIFETIME_DAYS: '7' }).tokenDefaultLifetimeDays).toBe(7);
  });
});
