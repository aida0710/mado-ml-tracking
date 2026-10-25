import type { MadoPluginCredentialsInput } from '@mmt/contracts';
import type { MadoCredentials } from '@mmt/platform';
import type { PluginConnectionRecord } from '../plugins/pluginConnection.js';
import { DomainError } from '../domain/errors.js';
import { decryptSecret, encryptSecret, type SecretKey } from './secretEncryption.js';

export class PluginCredentials {
  constructor(private readonly key: SecretKey | null) {}
  get available(): boolean {
    return this.key !== null;
  }

  read(
    plugin: Pick<PluginConnectionRecord, 'id' | 'secretKeyId' | 'encryptedCredentials'>,
  ): MadoCredentials {
    if (!plugin.encryptedCredentials || !plugin.secretKeyId) return {};
    if (!this.key)
      throw new DomainError({
        status: 503,
        code: 'plugin_secret_key_unavailable',
        message: 'the key for storing integration credentials is not set',
      });
    let saved: MadoCredentials;
    try {
      saved = JSON.parse(
        decryptSecret({
          key: this.key,
          context: `plugin-connection:${plugin.id}`,
          encrypted: { keyId: plugin.secretKeyId, payload: plugin.encryptedCredentials },
        }),
      ) as MadoCredentials;
    } catch {
      throw new DomainError({
        status: 503,
        code: 'plugin_secret_decryption_failed',
        message: 'the stored integration credentials cannot be decrypted; check the storage key',
      });
    }
    // migration 067より前に保存した用途別の鍵は無視する。access tokenは入力し直してもらう。
    return saved.accessToken ? { accessToken: saved.accessToken } : {};
  }

  hasAccessToken(plugin: PluginConnectionRecord): boolean {
    try {
      return Boolean(this.read(plugin).accessToken);
    } catch {
      return false;
    }
  }

  prepare(
    plugin: Pick<
      PluginConnectionRecord,
      'id' | 'secretKeyId' | 'encryptedCredentials' | 'credentialsConfigured'
    >,
    input: MadoPluginCredentialsInput | undefined,
  ) {
    if (!input?.accessToken)
      return {
        secretKeyId: plugin.secretKeyId,
        encryptedCredentials: plugin.encryptedCredentials,
        credentialsConfigured: plugin.credentialsConfigured,
      };
    if (!this.key)
      throw new DomainError({
        status: 503,
        code: 'plugin_secret_key_unavailable',
        message: 'set MMT_PLUGIN_SECRET_KEY on the API server',
      });
    // 新しいtokenで保存した値を置き換える。これで古い暗号鍵を失った場合も元に戻せる。
    const credentials: MadoCredentials = { accessToken: input.accessToken };
    const encrypted = encryptSecret({
      key: this.key,
      plaintext: JSON.stringify(credentials),
      context: `plugin-connection:${plugin.id}`,
    });
    return {
      secretKeyId: encrypted.keyId,
      encryptedCredentials: encrypted.payload,
      credentialsConfigured: { accessToken: true },
    };
  }
}
