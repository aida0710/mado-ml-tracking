import { describe, expect, it } from 'vitest';
import { requireDatabaseUrl } from '../src/db/databaseSettings.js';
import { loadPreviewWorkerConfig } from '../src/previewWorkerConfig.js';

describe('DB接続設定', () => {
  it('MMT_DATABASE_URLだけを接続先に使う', () => {
    const environment = { MMT_DATABASE_URL: 'postgres://localhost/mmt' };
    expect(requireDatabaseUrl(environment)).toBe(environment.MMT_DATABASE_URL);
    expect(loadPreviewWorkerConfig(environment).databaseUrl).toBe(environment.MMT_DATABASE_URL);
  });

  it('DATABASE_URLが指定されるとMMT_DATABASE_URLの有無によらず拒否する', () => {
    for (const MMT_DATABASE_URL of [undefined, 'postgres://localhost/mmt']) {
      const environment = { DATABASE_URL: 'postgres://localhost/other', MMT_DATABASE_URL };
      for (const load of [requireDatabaseUrl, loadPreviewWorkerConfig])
        expect(() => load(environment)).toThrow('DATABASE_URL is not supported; use MMT_DATABASE_URL');
    }
  });

  it('MMT_DATABASE_URLが空または欠損すると拒否する', () => {
    for (const MMT_DATABASE_URL of ['', undefined])
      expect(() => requireDatabaseUrl({ MMT_DATABASE_URL })).toThrow('MMT_DATABASE_URL is required');
  });
});
