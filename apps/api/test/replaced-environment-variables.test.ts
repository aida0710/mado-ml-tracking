import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { loadPreviewWorkerConfig } from '../src/previewWorkerConfig.js';

// 設定の検証だけを見る。この架空のデータベースには接続しない。
const MMT_DATABASE_URL = 'postgresql://mmt@127.0.0.1:1/unused';

describe('APIとプレビュー用workerの起動時の、旧い環境変数の名前の検査', () => {
  it('旧名だけが残っていると、どちらも代わりの名前を示して起動を止める', () => {
    const environment = {
      MMT_DATABASE_URL,
      MMT_AUTH_MODE: 'development',
      ARTIFACT_FILESYSTEM_ROOT: '/srv/artifacts',
    };
    for (const load of [loadConfig, loadPreviewWorkerConfig])
      expect(() => load(environment)).toThrow(
        'ARTIFACT_FILESYSTEM_ROOT was replaced by MMT_ARTIFACT_FILESYSTEM_ROOT',
      );
  });

  it('v0.5.0より前に替えた名前（DATABASE_URL、OIDC_ADMIN_GROUP）も同じ一覧で知らせる', () => {
    expect(() => loadPreviewWorkerConfig({ DATABASE_URL: MMT_DATABASE_URL })).toThrow(
      'DATABASE_URL was replaced by MMT_DATABASE_URL',
    );
    expect(() =>
      loadConfig({ MMT_DATABASE_URL, MMT_AUTH_MODE: 'local', OIDC_ADMIN_GROUP: 'mmt-admins' }),
    ).toThrow('OIDC_ADMIN_GROUP was replaced by MMT_OIDC_ROLE_MAPPING_JSON');
  });

  it('新しい名前があれば、残った旧名は読まずに新しい名前の値で起動する', () => {
    const config = loadConfig({
      MMT_DATABASE_URL,
      DATABASE_URL: 'postgresql://mmt@127.0.0.1:1/other',
      MMT_AUTH_MODE: 'development',
      AUTH_MODE: 'oidc',
      MMT_PORT: '4999',
      PORT: '4182',
    });
    expect(config).toMatchObject({
      databaseUrl: MMT_DATABASE_URL,
      authMode: 'development',
      port: 4999,
    });
  });
});
