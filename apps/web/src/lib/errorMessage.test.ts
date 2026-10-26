import { afterEach, describe, expect, it } from 'vitest';
import {
  ApiError,
  apiErrorFromResponse,
  INVALID_RESPONSE_CODE,
  NETWORK_ERROR_CODE,
} from '@mado/design-system/http';
import { ARTIFACT_TOO_LARGE_CODE } from '../api/http';
import { formatErrorMessage } from './errorMessage';
import { LocalizedError } from './localizedError';
import { text } from '../i18n/catalog';
import { setLocale } from '../i18n/locale';

afterEach(() => setLocale('ja'));

describe('formatErrorMessage', () => {
  it('APIの失敗は、どちらの言語の画面でもAPIの文をそのまま出す', () => {
    const failure = apiErrorFromResponse(409, 'Conflict', {
      error: 'a deleted run cannot be edited',
      code: 'run_deleted',
    });
    setLocale('ja');
    expect(formatErrorMessage(failure)).toBe('a deleted run cannot be edited');
    setLocale('en');
    expect(formatErrorMessage(failure)).toBe('a deleted run cannot be edited');
  });

  it('APIの形でない失敗の応答は、HTTPの状態を出す', () => {
    expect(formatErrorMessage(apiErrorFromResponse(502, 'Bad Gateway', undefined))).toBe('HTTP 502 Bad Gateway');
  });

  it('通信の失敗・形の合わない応答・手前のプロキシが断った大きすぎるArtifactは、表示言語の文にする', () => {
    const cases = [
      [new ApiError({ status: 0, code: NETWORK_ERROR_CODE, message: 'Failed to fetch' }), () => text.requestError],
      [new ApiError({ status: 200, code: INVALID_RESPONSE_CODE, message: 'Unexpected response' }), () => text.invalidResponse],
      [new ApiError({ status: 413, code: ARTIFACT_TOO_LARGE_CODE, message: 'HTTP 413' }), () => text.artifactTooLarge],
    ] as const;
    for (const [failure, screenText] of cases) {
      setLocale('ja');
      expect(formatErrorMessage(failure)).toBe(screenText());
      setLocale('en');
      expect(formatErrorMessage(failure)).toBe(screenText());
    }
  });

  it('画面側の失敗は、作った文か今の表示言語の文で出す', () => {
    expect(formatErrorMessage(new Error(text.jsonError))).toBe(text.jsonError);
    const localized = new LocalizedError(() => text.requestError);
    setLocale('en');
    expect(formatErrorMessage(localized)).toBe(text.requestError);
    expect(formatErrorMessage('stopped')).toBe('stopped');
  });
});
