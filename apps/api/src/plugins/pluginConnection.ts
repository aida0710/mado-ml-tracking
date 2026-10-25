import type {
  MadoAccessTokenGrant,
  MadoPluginConfig,
  PluginConnection,
  PluginManifest,
} from '@mmt/contracts';

/** 保存するフィールドだけ。暗号文が決して漏れないよう、DTOは明示的に組み立てる。 */
export interface PluginConnectionRecord {
  id: string;
  projectId: string;
  name: string;
  kind: 'mado';
  config: MadoPluginConfig;
  configRevision: number;
  credentialsConfigured: PluginConnection['credentialsConfigured'];
  secretKeyId: string | null;
  encryptedCredentials: Buffer | null;
  enabled: boolean;
  manifest: PluginManifest | null;
  accessTokenGrant: MadoAccessTokenGrant | null;
  createdAt: string;
}
