import { describe, expect, it } from 'vitest';
import { ApiError } from '@mado/design-system/http';
import { explainLastProjectAdminConflict } from './lastProjectAdminConflict';
import { text } from '../i18n/catalog';

describe('最後のProject adminを外す変更', () => {
  it('409は管理者がいなくなる理由の文言に置き換える', async () => {
    const conflict = new ApiError({ status: 409, code: 'conflict', message: 'raw' });
    await expect(explainLastProjectAdminConflict(Promise.reject(conflict))).rejects.toThrow(
      text.lastProjectAdminConflict,
    );
  });

  it('409以外の失敗はそのまま返す', async () => {
    const forbidden = new ApiError({ status: 403, code: 'forbidden', message: 'forbidden' });
    await expect(explainLastProjectAdminConflict(Promise.reject(forbidden))).rejects.toBe(
      forbidden,
    );
  });

  it('成功した変更の結果はそのまま返す', async () => {
    expect(await explainLastProjectAdminConflict(Promise.resolve('saved'))).toBe('saved');
  });
});
