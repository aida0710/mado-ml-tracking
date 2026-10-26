import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '@mado/design-system/http';
import { formatErrorMessage } from './errorMessage';
import { explainUploadFailure } from './uploadFailure';
import { setLocale } from '../i18n/locale';

afterEach(() => setLocale('ja'));

describe('explainUploadFailure', () => {
  it('断られた続きの送信は、次にすることの後ろにAPIの文を添え、次にすることは表示言語を変えると追従する', () => {
    const failure = new ApiError({ status: 409, code: 'run_deleted', message: 'the run was deleted' });
    const cause = explainUploadFailure({ failure, blocker: 'runDeleted', startsOver: false, method: 'multipart' });
    expect(formatErrorMessage(cause)).toBe('別のRunへ送ってください。（the run was deleted）');
    setLocale('en');
    expect(formatErrorMessage(cause)).toBe('Upload it to a different run. (the run was deleted)');
  });

  it('最初から送り直すときは、その案内を次にすることにする', () => {
    const cause = explainUploadFailure({
      failure: new ApiError({ status: 409, code: 'upload_expired', message: 'the upload session expired' }),
      blocker: 'expired',
      startsOver: true,
      method: 'multipart',
    });
    expect(formatErrorMessage(cause)).toBe('［再開］を押すと、最初から送り直します。（the upload session expired）');
  });

  it('通信が切れたときは、分割の送信なら続きから、1回の送信なら送り直すと案内する', () => {
    const failure = new ApiError({ status: 0, code: 'network_error', message: 'Failed to fetch' });
    expect(formatErrorMessage(explainUploadFailure({ failure, blocker: null, startsOver: false, method: 'multipart' }))).toContain('続きから送ります');
    expect(formatErrorMessage(explainUploadFailure({ failure, blocker: null, startsOver: false, method: 'single' }))).toContain('送り直します');
  });

  it('ほかの失敗はそのまま返す', () => {
    const failure = new ApiError({ status: 503, code: 'artifact_save_failed', message: '保存できません' });
    expect(explainUploadFailure({ failure, blocker: null, startsOver: false, method: 'single' })).toBe(failure);
  });
});
