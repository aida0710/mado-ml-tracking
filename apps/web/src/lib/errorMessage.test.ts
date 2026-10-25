import { afterEach, describe, expect, it } from 'vitest';
import { invalidResponseError, RequestError } from '../api/http';
import { formatErrorMessage } from './errorMessage';
import { text } from '../i18n/catalog';
import { setLocale } from '../i18n/locale';

afterEach(() => setLocale('ja'));

describe('formatErrorMessage', () => {
  it('辞書に無いcodeは、APIの英語の文をそのまま表示する', () => {
    const failure = new RequestError({
      status: 503,
      code: 'storage_failed',
      serverMessage: 'cannot store the file',
    });
    expect(formatErrorMessage(failure)).toBe('cannot store the file');
  });
  it('未知のcodeでもサーバーの文字列を使う', () => {
    const failure = new RequestError({
      status: 409,
      code: 'something_new',
      serverMessage: 'Task revision changed',
    });
    expect(formatErrorMessage(failure)).toBe('Task revision changed');
  });
  it('接続できなかったときは接続失敗の文言にする', () => {
    expect(formatErrorMessage(new RequestError({ status: 0, code: 'network_error' }))).toBe(
      text.requestError,
    );
  });
  it('応答形式の不一致は契約不一致の文言にする', () => {
    expect(formatErrorMessage(invalidResponseError())).toBe(text.invalidResponse);
  });
  it('413はAPIでも前段proxyでも同じ上限超過の文言にする', () => {
    expect(
      formatErrorMessage(
        new RequestError({ status: 413, code: 'artifact_too_large', serverMessage: 'too large' }),
      ),
    ).toBe(text.artifactTooLarge);
  });
  it('Artifactの中身を取れなかったときはプレビュー失敗の文言にステータスを添える', () => {
    expect(
      formatErrorMessage(new RequestError({ status: 404, code: 'artifact_content_unavailable' })),
    ).toBe(`${text.contentError} (404)`);
  });
  it('理由のない失敗応答はステータスを添えて表示する', () => {
    expect(formatErrorMessage(new RequestError({ status: 502 }))).toBe(
      `${text.requestError} (502)`,
    );
  });
  it('日本語の画面では、辞書にあるcodeを日本語の文に訳す', () => {
    const failure = new RequestError({
      status: 409,
      code: 'run_deleted',
      serverMessage: 'a deleted run cannot be edited',
    });
    expect(formatErrorMessage(failure)).toBe('削除済みのRunにはこの操作を行えません');
  });
  it('英語の画面では、辞書にあるcodeでもAPIの英語の文をそのまま出す', () => {
    setLocale('en');
    const failure = new RequestError({
      status: 409,
      code: 'run_deleted',
      serverMessage: 'a deleted run cannot be edited',
    });
    expect(formatErrorMessage(failure)).toBe('a deleted run cannot be edited');
  });
  it('辞書にあるcodeでAPIが理由を返さなかったときも、日本語の画面は辞書の文を出す', () => {
    expect(formatErrorMessage(new RequestError({ status: 409, code: 'run_deleted' }))).toBe(
      '削除済みのRunにはこの操作を行えません',
    );
  });
  it('理由の幅広いcodeは、日本語の文のあとにAPIの英語の文を括弧で添える', () => {
    const failure = new RequestError({
      status: 409,
      code: 'conflict',
      serverMessage: 'jobs can be created only for queued runs',
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
