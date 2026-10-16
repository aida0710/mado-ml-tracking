import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('token期限の既定日数の設定', () => {
  // Config validation does not connect to this synthetic database.
  const environment = { AUTH_MODE: 'development', MMT_DATABASE_URL: 'postgresql://test@127.0.0.1:1/unused' };
  it('設定がなければ365日になる', () => {
    expect(loadConfig(environment).tokenDefaultLifetimeDays).toBe(365);
  });
  it('MMT_TOKEN_DEFAULT_LIFETIME_DAYSで既定日数を変えられる', () => {
    expect(loadConfig({ ...environment, MMT_TOKEN_DEFAULT_LIFETIME_DAYS: '7' }).tokenDefaultLifetimeDays).toBe(7);
  });
  it('旧い設定名MMT_TOKEN_MAX_LIFETIME_DAYSは読まない', () => {
    expect(loadConfig({ ...environment, MMT_TOKEN_MAX_LIFETIME_DAYS: '30' }).tokenDefaultLifetimeDays).toBe(365);
  });
});
