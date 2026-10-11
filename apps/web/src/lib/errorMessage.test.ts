import { afterEach, describe, expect, it } from 'vitest';
import { invalidResponseError, RequestError } from '../api/http';
import { text } from '../i18n/catalog';
import { setLocale } from '../i18n/locale';
import { formatErrorMessage } from './errorMessage';

afterEach(() => setLocale('ja'));

describe('formatErrorMessage', () => {
  it('APIが返した理由をそのまま表示する', () => {
    const failure = new RequestError({
      status: 503,
      code: 'storage_failed',
      serverMessage: '保存できません',
    });
    expect(formatErrorMessage(failure)).toBe('保存できません');
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
  it('日本語の画面では、既知のcodeでもAPIの具体的な日本語の理由をそのまま出す', () => {
    const failure = new RequestError({
      status: 409,
      code: 'run_deleted',
      serverMessage: '削除済みのRunは編集できません',
    });
    expect(formatErrorMessage(failure)).toBe('削除済みのRunは編集できません');
  });
  it('英語の画面では、既知のcodeのAPIの日本語の理由を英語の文に置き換える', () => {
    setLocale('en');
    const failure = new RequestError({
      status: 409,
      code: 'run_deleted',
      serverMessage: '削除済みのRunは編集できません',
    });
    expect(formatErrorMessage(failure)).toBe('This operation is not available for a deleted run.');
  });
  it('既知のcodeでAPIが理由を返さなかったときは、日本語の画面でもカタログの文を出す', () => {
    expect(formatErrorMessage(new RequestError({ status: 409, code: 'run_deleted' }))).toBe(
      '削除済みのRunにはこの操作を行えません',
    );
  });
  it('英語の画面でも、未知のcodeのAPIの理由はそのまま出す', () => {
    setLocale('en');
    const failure = new RequestError({ status: 409, code: 'something_new', serverMessage: '新しい理由' });
    expect(formatErrorMessage(failure)).toBe('新しい理由');
  });
  it('画面側の検証エラーとError以外の値も表示できる', () => {
    expect(formatErrorMessage(new Error(text.jsonError))).toBe(text.jsonError);
    expect(formatErrorMessage('stopped')).toBe('stopped');
  });
});
