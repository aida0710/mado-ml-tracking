import { describe, expect, it } from 'vitest';
import {
  REPLACED_ENVIRONMENT_VARIABLES,
  rejectReplacedEnvironmentVariables,
} from './replacedEnvironmentVariables.js';

describe('旧い環境変数の名前の検査', () => {
  it('旧名だけが設定されていると、残っている旧名と代わりの名前をすべて並べて止める', () => {
    expect(() =>
      rejectReplacedEnvironmentVariables({ AUTH_MODE: 'local', S3_BUCKET: 'artifacts' }),
    ).toThrow(
      'Old environment variable names are set: AUTH_MODE was replaced by MMT_AUTH_MODE; ' +
        'S3_BUCKET was replaced by MMT_S3_BUCKET',
    );
  });

  it('エラーには名前だけを出し、値は出さない', () => {
    const secret = 'secret-value-that-must-not-be-printed';
    expect(() => rejectReplacedEnvironmentVariables({ OIDC_CLIENT_SECRET: secret })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
  });

  it('空の値も設定されているとみなす', () => {
    expect(() => rejectReplacedEnvironmentVariables({ S3_SECRET_ACCESS_KEY: '' })).toThrow(
      /S3_SECRET_ACCESS_KEY was replaced by MMT_S3_SECRET_ACCESS_KEY/,
    );
  });

  it('新しい名前もあるときは旧名を無視する', () => {
    expect(() =>
      rejectReplacedEnvironmentVariables({ AUTH_MODE: 'oidc', MMT_AUTH_MODE: 'local' }),
    ).not.toThrow();
  });

  it('一覧の新しい名前はすべてMMT_で始まり、旧名は重ならない', () => {
    const oldNames = REPLACED_ENVIRONMENT_VARIABLES.map(({ oldName }) => oldName);
    expect(new Set(oldNames).size).toBe(oldNames.length);
    for (const { oldName, newName } of REPLACED_ENVIRONMENT_VARIABLES) {
      expect(newName).toMatch(/^MMT_/);
      expect(oldName).not.toMatch(/^MMT_/);
    }
  });
});
