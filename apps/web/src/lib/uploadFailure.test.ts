import { afterEach, describe, expect, it } from 'vitest';
import { RequestError } from '../api/http';
import { setLocale } from '../i18n/locale';
import { formatErrorMessage } from './errorMessage';
import { explainUploadFailure } from './uploadFailure';

afterEach(() => setLocale('ja'));

describe('explainUploadFailure', () => {
  it('断られた続きの送信は、理由と次にすることを1つの文にし、表示言語を変えると追従する', () => {
    const failure = new RequestError({ status: 409, code: 'run_deleted' });
    const cause = explainUploadFailure({ failure, blocker: 'runDeleted', startsOver: false, method: 'multipart' });
    expect(formatErrorMessage(cause)).toBe('このRunは削除されたため、Artifactを追加できません。別のRunへ送ってください。');
    setLocale('en');
    expect(formatErrorMessage(cause)).toBe(
      'This run was deleted, so artifacts cannot be added to it. Upload it to a different run.',
    );
  });

  it('最初から送り直すときは、その案内を次にすることにする', () => {
    const cause = explainUploadFailure({
      failure: new RequestError({ status: 409, code: 'upload_expired' }),
      blocker: 'expired',
      startsOver: true,
      method: 'multipart',
    });
    expect(formatErrorMessage(cause)).toBe(
      '期限（7日）が切れたため、送信済みの部分は使えません。［再開］を押すと、最初から送り直します。',
    );
  });

  it('通信が切れたときは、分割の送信なら続きから、1回の送信なら送り直すと案内する', () => {
    const failure = new RequestError({ status: 0, code: 'network_error' });
    expect(formatErrorMessage(explainUploadFailure({ failure, blocker: null, startsOver: false, method: 'multipart' }))).toContain('続きから送ります');
    expect(formatErrorMessage(explainUploadFailure({ failure, blocker: null, startsOver: false, method: 'single' }))).toContain('送り直します');
  });

  it('ほかの失敗はそのまま返す', () => {
    const failure = new RequestError({ status: 503, code: 'artifact_save_failed', serverMessage: '保存できません' });
    expect(explainUploadFailure({ failure, blocker: null, startsOver: false, method: 'single' })).toBe(failure);
  });
});
