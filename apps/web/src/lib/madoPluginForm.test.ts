import { describe, expect, it } from 'vitest';
import type { PluginConnection } from '@mmt/contracts';
import { getMadoPluginConfig, getMadoPluginCredentials, getMadoPluginFormValues } from './madoPluginForm';

describe('Madoの接続設定入力', () => {
  it('保存済みのアクセストークンを入力欄へ戻さず、空欄なら送信しない', () => {
    const values = getMadoPluginFormValues({ name: 'Mado', config: null } as PluginConnection);
    expect(values.accessToken).toBe('');
    expect(getMadoPluginCredentials(values)).toBeUndefined();
    expect(getMadoPluginCredentials({ ...values, accessToken: 'entered-token' })).toEqual({ accessToken: 'entered-token' });
  });

  it('送信先の省略はAPI URLに合わせ、Namespaceは入力させずトークンの許可範囲に任せる', () => {
    const values = { ...getMadoPluginFormValues(null), apiUrl: ' https://api.example ' };
    const config = getMadoPluginConfig(values);
    expect(config).toEqual({
      apiUrl: 'https://api.example', webUrl: '', lineageUrl: 'https://api.example',
      jobNamespace: 'mado-model-tracking', storageSystemKey: 'mado-model-tracking',
    });
    expect(config).not.toHaveProperty('namespaces');
  });
});
