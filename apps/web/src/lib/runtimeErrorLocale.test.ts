import { afterEach, describe, expect, it } from 'vitest';
import { ApiError, apiErrorFromResponse, NETWORK_ERROR_CODE } from '@mado/design-system/http';
import { formatErrorMessage } from './errorMessage';
import { convertWandbSweepConfig, SweepConfigError } from './sweepConfig';
import { formatUploadFailure } from './uploadFailure';
import { parseSiteVariables } from './siteVariables';
import { buildSiteSettingsInput, siteSettingsFormValues } from './siteSettingsInput';
import { globalSiteDetails } from '../../tests/fixtures/siteComputers';
import type { UploadFailure } from '../types/uploadFailure';
import { setLocale } from '../i18n/locale';
import { text } from '../i18n/catalog';
import { siteComputersTextTemplates } from '../i18n/siteComputers';

afterEach(() => setLocale('ja'));

const minimalConfig = {
  method: 'grid',
  metric: { name: 'loss', goal: 'minimize' },
  parameters: { lr: { values: [0.1] } },
  run_cap: 1,
};

describe('retained failures follow the display language', () => {
  it('a retained network failure follows the display language', () => {
    const failure = new ApiError({ status: 0, code: NETWORK_ERROR_CODE, message: 'Failed to fetch' });
    setLocale('ja');
    const japanese = formatErrorMessage(failure);
    setLocale('en');
    expect(formatErrorMessage(failure)).toBe(text.requestError);
    expect(formatErrorMessage(failure)).not.toBe(japanese);
  });

  it('known API codes are translated from the code in Japanese and keep the API sentence in English', () => {
    const failure = new ApiError({ status: 503, code: 'artifact_save_failed', message: 'failed to save the part' });
    setLocale('ja');
    expect(formatErrorMessage(failure)).toBe('Artifactを保存できませんでした');
    setLocale('en');
    expect(formatErrorMessage(failure)).toBe('failed to save the part');
  });

  it('a code missing from the dictionary shows the API sentence in either language', () => {
    const failure = new ApiError({ status: 422, code: 'future_service_code', message: 'the new reason' });
    setLocale('en');
    expect(formatErrorMessage(failure)).toBe('the new reason');
    setLocale('ja');
    expect(formatErrorMessage(failure)).toBe('the new reason');
  });

  it('a captured conversion error updates its explanation and retains the parameter name', () => {
    const name = '日本語のパラメータ';
    let failure: SweepConfigError | undefined;
    setLocale('ja');
    try {
      convertWandbSweepConfig({ ...minimalConfig, parameters: { [name]: { distribution: 'normal' } } });
    } catch (cause) {
      if (!(cause instanceof SweepConfigError)) throw cause;
      failure = cause;
    }
    expect(failure).toBeInstanceOf(SweepConfigError);
    expect(formatErrorMessage(failure)).toContain('対応していません');
    setLocale('en');
    expect(formatErrorMessage(failure)).toContain(name);
    expect(formatErrorMessage(failure)).toContain('normal');
    expect(formatErrorMessage(failure)).not.toContain('対応していません');
  });

  it('a retained upload failure and cancellation prefix update without altering details', () => {
    const cause = new ApiError({ status: 0, code: NETWORK_ERROR_CODE, message: 'Failed to fetch' });
    const failure: UploadFailure = { kind: 'request', cause };
    const cancellation: UploadFailure = { kind: 'cancel', cause: new Error('研究チームの接続詳細') };
    setLocale('ja');
    const japanese = formatUploadFailure(failure);
    setLocale('en');
    expect(formatUploadFailure(failure)).toBe(text.requestError);
    expect(formatUploadFailure(failure)).not.toBe(japanese);
    expect(formatUploadFailure(cancellation)).toBe(`${text.uploadCancelNotSent}: 研究チームの接続詳細`);
  });

  it('parameter locations and range field labels also follow a captured error into English', () => {
    const name = '研究（A）';
    for (const definition of [{ values: [1], unexpected: true }, { distribution: 'uniform', min: 'invalid', max: 2 }]) {
      setLocale('ja');
      let failure: unknown;
      try {
        convertWandbSweepConfig({ ...minimalConfig, parameters: { [name]: definition } });
      } catch (cause) {
        failure = cause;
      }
      expect(failure).toBeInstanceOf(SweepConfigError);
      setLocale('en');
      const message = formatErrorMessage(failure);
      expect(message).toContain(name);
      expect(message).not.toContain('min・max');
      expect(message).not.toContain('parameter「');
    }
  });

  it('a captured API search-space error retains its row name and both limits', () => {
    const name = '日本語.[x]';
    const failure = apiErrorFromResponse(422, 'Unprocessable Entity', {
      error: `parameter "${name}" values exceed the limit of 1000 (received: 1001)`,
      code: 'sweep_space_invalid',
      reason: 'values_limit',
      parameter: name,
      limit: 1000,
      count: 1001,
    });
    setLocale('ja');
    expect(formatErrorMessage(failure)).toContain('1000個までです');
    setLocale('en');
    expect(formatErrorMessage(failure)).toBe(`Parameter “${name}” values exceed the limit of 1000 (received: 1001)`);
  });

  it('a refused form value keeps its argument and is described in the language shown now', () => {
    const line = '研究用の 変数';
    setLocale('ja');
    let failure: unknown;
    try {
      parseSiteVariables(line);
    } catch (cause) {
      failure = cause;
    }
    const japanese = formatErrorMessage(failure);
    setLocale('en');
    expect(formatErrorMessage(failure)).toBe(siteComputersTextTemplates.siteVariableLineError(line));
    expect(formatErrorMessage(failure)).not.toBe(japanese);
  });

  it('a refused number names its field in the language shown now, not the one it was refused in', () => {
    const values = { ...siteSettingsFormValues(globalSiteDetails.site), submissionMode: 'automatic', sitePort: '70000' };
    setLocale('ja');
    let failure: unknown;
    try {
      buildSiteSettingsInput(values);
    } catch (cause) {
      failure = cause;
    }
    setLocale('en');
    expect(formatErrorMessage(failure)).toBe(siteComputersTextTemplates.siteNumberRangeError(text.sitePort, 1, 65535));
  });

  it('a new API search-space explanation is preserved instead of guessed', () => {
    const failure = new ApiError({ status: 422, code: 'sweep_space_invalid', message: 'new constraint: 日本語の値' });
    setLocale('en');
    expect(formatErrorMessage(failure)).toBe('new constraint: 日本語の値');
  });
});
