import { afterEach, describe, expect, it } from 'vitest';
import { ApiError, apiErrorFromResponse } from '@mado/design-system/http';
import { setLocale } from '../i18n/locale';
import { apiErrorMessage } from './apiErrorMessage';

afterEach(() => setLocale('ja'));

describe('APIのエラーの文', () => {
  it('invalid_requestは英語の画面でAPIの文をそのまま、日本語の画面で決まった文のあとに詳細を添える', () => {
    const failure = apiErrorFromResponse(422, 'Unprocessable Entity', {
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
    const failure = apiErrorFromResponse(409, 'Conflict', {
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
    const failure = apiErrorFromResponse(403, 'Forbidden', {
      error: 'the API token lacks the scope runs:write required for this operation',
      code: 'scope_required',
      scope: 'runs:write',
      purpose: 'recording',
    });
    expect(apiErrorMessage(failure)).toContain('用途「SDK・MLflow 3から記録する」');
  });

  it('APIの形でない本文は、HTTPの状態の文を出す', () => {
    expect(apiErrorMessage(apiErrorFromResponse(502, 'Bad Gateway', '<html>Bad Gateway</html>'))).toBe('HTTP 502 Bad Gateway');
    expect(apiErrorMessage(new ApiError({ status: 0, code: 'network_error', message: 'Failed to fetch' }))).toBe('Failed to fetch');
  });
});
