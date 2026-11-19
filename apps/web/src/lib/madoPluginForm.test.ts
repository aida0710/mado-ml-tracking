import { describe, expect, it } from 'vitest';
import { getMadoPluginConfig, getMadoPluginCredentials, getMadoPluginFormValues } from './madoPluginForm';

describe('Madoの接続設定入力', () => {
  it('保存済みのアクセストークンを入力欄へ戻さず、空欄なら送信しない', () => {
    const values = getMadoPluginFormValues(null);
    expect(values.accessToken).toBe('');
    expect(getMadoPluginCredentials(values)).toBeUndefined();
    expect(getMadoPluginCredentials({ ...values, accessToken: 'entered-token' })).toEqual({ accessToken: 'entered-token' });
  });

  it('接続先のURLは前後の空白を除いて送る', () => {
    const values = {
      ...getMadoPluginFormValues(null), apiUrl: ' https://api.example ', webUrl: ' https://mado.example ',
    };
    expect(getMadoPluginConfig(values)).toEqual({ apiUrl: 'https://api.example', webUrl: 'https://mado.example' });
  });
});
