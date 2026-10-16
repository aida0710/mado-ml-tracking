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
      throw new DomainError(
        503,
        '連携キーの保存用の鍵が設定されていません',
        'plugin_secret_key_unavailable',
      );
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
      throw new DomainError(
        503,
        '保存済みの連携キーを復号できません。保存用の鍵を確認してください',
        'plugin_secret_decryption_failed',
      );
    }
    // Per-purpose keys saved before migration 067 are ignored; the access token is entered again.
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
      throw new DomainError(
        503,
        'MMT_PLUGIN_SECRET_KEYをAPI serverに設定してください',
        'plugin_secret_key_unavailable',
      );
    // A new token replaces the saved value, which also recovers from loss of the old encryption key.
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
