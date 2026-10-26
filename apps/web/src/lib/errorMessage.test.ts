import { afterEach, describe, expect, it } from 'vitest';
import { ApiError, apiErrorFromResponse, INVALID_RESPONSE_CODE } from '@mado/design-system/http';
import { formatErrorMessage } from './errorMessage';
import { text } from '../i18n/catalog';
import { setLocale } from '../i18n/locale';

afterEach(() => setLocale('ja'));

describe('formatErrorMessage', () => {
  it('辞書に無いcodeは、APIの英語の文をそのまま表示する', () => {
    const failure = new ApiError({
      status: 503,
      code: 'storage_failed',
      message: 'cannot store the file',
    });
    expect(formatErrorMessage(failure)).toBe('cannot store the file');
  });
  it('未知のcodeでもサーバーの文字列を使う', () => {
    const failure = new ApiError({
      status: 409,
      code: 'something_new',
      message: 'Task revision changed',
    });
    expect(formatErrorMessage(failure)).toBe('Task revision changed');
  });
  it('接続できなかったときは接続失敗の文言にする', () => {
    expect(formatErrorMessage(new ApiError({ status: 0, code: 'network_error', message: 'Failed to fetch' }))).toBe(
      text.requestError,
    );
  });
  it('応答形式の不一致は契約不一致の文言にする', () => {
    const failure = new ApiError({ status: 200, code: INVALID_RESPONSE_CODE, message: 'Unexpected response' });
    expect(formatErrorMessage(failure)).toBe(text.invalidResponse);
  });
  it('413はAPIでも前段proxyでも同じ上限超過の文言にする', () => {
    expect(
      formatErrorMessage(
        new ApiError({ status: 413, code: 'artifact_too_large', message: 'too large' }),
      ),
    ).toBe(text.artifactTooLarge);
  });
  it('理由のない失敗応答はHTTPの状態を表示する', () => {
    expect(formatErrorMessage(apiErrorFromResponse(502, 'Bad Gateway', undefined))).toBe('HTTP 502 Bad Gateway');
  });
  it('日本語の画面では、辞書にあるcodeを日本語の文に訳す', () => {
    const failure = new ApiError({
      status: 409,
      code: 'run_deleted',
      message: 'a deleted run cannot be edited',
    });
    expect(formatErrorMessage(failure)).toBe('削除済みのRunにはこの操作を行えません');
  });
  it('英語の画面では、辞書にあるcodeでもAPIの英語の文をそのまま出す', () => {
    setLocale('en');
    const failure = new ApiError({
      status: 409,
      code: 'run_deleted',
      message: 'a deleted run cannot be edited',
    });
    expect(formatErrorMessage(failure)).toBe('a deleted run cannot be edited');
  });
  it('理由の幅広いcodeは、日本語の文のあとにAPIの英語の文を括弧で添える', () => {
    const failure = new ApiError({
      status: 409,
      code: 'conflict',
      message: 'jobs can be created only for queued runs',
    });
    expect(formatErrorMessage(failure)).toBe(
      '今の状態ではこの操作はできません。（jobs can be created only for queued runs）',
    );
  });
  it('画面側の検証エラーとError以外の値も表示できる', () => {
    expect(formatErrorMessage(new Error(text.jsonError))).toBe(text.jsonError);
    expect(formatErrorMessage('stopped')).toBe('stopped');
  });
});
