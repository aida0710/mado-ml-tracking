import { afterEach, describe, expect, it } from 'vitest';
import { RequestError, requestErrorFromBody } from '../api/http';
import { setLocale } from '../i18n/locale';
import { apiErrorMessage } from './apiErrorMessage';

afterEach(() => setLocale('ja'));

describe('APIのエラーの文', () => {
  it('invalid_requestは英語の画面でAPIの文をそのまま、日本語の画面で決まった文のあとに詳細を添える', () => {
    const failure = requestErrorFromBody(422, {
      error: 'invalid request: name, scopes',
      code: 'invalid_request',
      fields: ['name', 'scopes'],
    });
    setLocale('en');
    expect(apiErrorMessage(failure)).toBe('invalid request: name, scopes');
    setLocale('ja');
    expect(apiErrorMessage(failure)).toBe('入力内容を確認してください。（invalid request: name, scopes）');
  });

  it('日本語の画面は文に入る値を横の項目から読む', () => {
    const failure = requestErrorFromBody(409, {
      error: 'another edit was saved as version 3; reopen the latest version before editing',
      code: 'report_revision_conflict',
      currentRevision: 3,
    });
    expect(failure.details).toEqual({ currentRevision: 3 });
    expect(apiErrorMessage(failure)).toBe(
      'ほかの編集がバージョン3として保存されています。最新のバージョンを開き直してから編集してください',
    );
  });

  it('scopeが足りないときは、発行の画面の用途を日本語の名前で示す', () => {
    const failure = requestErrorFromBody(403, {
      error: 'the API token lacks the scope runs:write required for this operation',
      code: 'scope_required',
      scope: 'runs:write',
      purpose: 'recording',
    });
    expect(apiErrorMessage(failure)).toContain('用途「SDK・MLflow 3から記録する」');
  });

  it('APIの形でない本文はnullで、呼び出し側が文を選ぶ', () => {
    expect(apiErrorMessage(requestErrorFromBody(502, '<html>Bad Gateway</html>'))).toBeNull();
    expect(apiErrorMessage(new RequestError({ status: 0, code: 'network_error' }))).toBeNull();
  });
});
