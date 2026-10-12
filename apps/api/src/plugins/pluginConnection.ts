import type { MadoPluginConfig, PluginConnection, PluginManifest } from '@mmt/contracts';

/** Persisted fields only; the DTO is assembled explicitly so ciphertext can never leak. */
export interface PluginConnectionRecord {
  id: string;
  projectId: string;
  name: string;
  kind: 'mado' | 'legacy';
  config: MadoPluginConfig | null;
  migrationPending: boolean;
  configRevision: number;
  credentialsConfigured: PluginConnection['credentialsConfigured'];
  secretKeyId: string | null;
  encryptedCredentials: Buffer | null;
  baseUrl: string;
  tokenEnv: string;
  enabled: boolean;
  manifest: PluginManifest | null;
  createdAt: string;
}
