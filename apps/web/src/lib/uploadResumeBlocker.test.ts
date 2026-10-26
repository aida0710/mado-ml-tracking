import { describe, expect, it } from 'vitest';
import { ApiError } from '@mado/design-system/http';
import {
  blockerFromFailure,
  blockerFromSession,
  canChooseAnotherFileAfter,
  isSessionUnusable,
  type ResumeBlocker,
} from './uploadResumeBlocker';

const NOW = Date.parse('2026-10-11T12:00:00Z');

describe('blockerFromSession', () => {
  it('受け付け中で期限内なら続きにでき、検証中・完了も止めない', () => {
    for (const status of ['open', 'verifying', 'completed'] as const)
      expect(blockerFromSession({ status, expiresAt: '2026-10-18T12:00:00Z' }, NOW)).toBeNull();
  });

  it('期限の時刻ちょうどで期限切れになる', () => {
    expect(blockerFromSession({ status: 'open', expiresAt: '2026-10-11T12:00:00Z' }, NOW)).toBe('expired');
    expect(blockerFromSession({ status: 'expired', expiresAt: '2026-10-18T12:00:00Z' }, NOW)).toBe('expired');
  });
});

describe('blockerFromFailure', () => {
  it('Runの削除はRunの理由、一時的な失敗や知らないコードは理由なしにする', () => {
    expect(blockerFromFailure(new ApiError({ status: 409, code: 'run_deleted', message: 'the run was deleted' }))).toBe('runDeleted');
    expect(blockerFromFailure(new ApiError({ status: 503, code: 'artifact_save_failed', message: 'failed to save the artifact' }))).toBeNull();
    expect(blockerFromFailure(new ApiError({ status: 500, message: 'HTTP 500' }))).toBeNull();
    expect(blockerFromFailure(new Error('boom'))).toBeNull();
  });
});

describe('次にできること', () => {
  it('期限切れ・消えた・別の認証情報は、同じ保存パスへ最初から送れる', () => {
    const startOverBlockers: ResumeBlocker[] = ['expired', 'gone', 'otherCredential'];
    expect(startOverBlockers.every(isSessionUnusable)).toBe(true);
    expect(isSessionUnusable('permissionLost')).toBe(false);
    expect(isSessionUnusable('contentDiffers')).toBe(false);
  });

  it('サイズや中身の違いは、別のファイルを選び直せば解ける', () => {
    expect(canChooseAnotherFileAfter('sizeDiffers')).toBe(true);
    expect(canChooseAnotherFileAfter('contentDiffers')).toBe(true);
    expect(canChooseAnotherFileAfter('expired')).toBe(false);
  });
});
