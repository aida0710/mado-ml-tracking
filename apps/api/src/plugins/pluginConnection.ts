import type {
  MadoAccessTokenGrant,
  MadoPluginConfig,
  PluginConnection,
  PluginManifest,
} from '@mmt/contracts';

/** Persisted fields only; the DTO is assembled explicitly so ciphertext can never leak. */
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
