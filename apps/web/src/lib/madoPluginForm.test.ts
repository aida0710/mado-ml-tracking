import { describe, expect, it } from 'vitest';
import type { PluginConnection } from '@mmt/contracts';
import { getMadoPluginConfig, getMadoPluginCredentials, getMadoPluginFormValues } from './madoPluginForm';

describe('Madoの接続設定入力', () => {
  it('保存済みのキーを入力欄へ戻さず空欄のキーを送信しない', () => {
    const values = getMadoPluginFormValues({ name: 'Mado', config: null } as PluginConnection);
    expect(values.readToken).toBe('');
    expect(values.lineageToken).toBe('');
    expect(getMadoPluginCredentials(values)).toBeUndefined();
  });

  it('容量キーの削除を明示し参照・送信用キーの未入力は保持する', () => {
    const values = { ...getMadoPluginFormValues(null), metricsToken: 'unsaved', removeMetricsToken: 'true' };
    expect(getMadoPluginCredentials(values)).toEqual({ metricsToken: null });
  });

  it('送信先の省略はAPI URLに合わせNamespaceを重複なく保存する', () => {
    const values = { ...getMadoPluginFormValues(null), apiUrl: ' https://api.example ',
      namespaces: 'speech, music\nspeech\n' };
    expect(getMadoPluginConfig(values)).toMatchObject({
      apiUrl: 'https://api.example', lineageUrl: 'https://api.example', namespaces: ['speech', 'music'],
    });
  });
});
