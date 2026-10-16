/** What the saved Mado access token allows, as Mado reported it at the last connection check. */
export interface MadoAccessTokenGrant {
  name: string;
  /** Mado scopes, such as those in {@link MADO_SCOPES}. */
  scopes: string[];
  /** `['*']` ({@link ALL_MADO_NAMESPACES}) allows every namespace. */
  namespaces: string[];
  expiresAt: string | null;
}

/** Mado's namespace entry that allows every namespace. */
export const ALL_MADO_NAMESPACES = '*';
/** The Mado scopes the integration uses; Mado derives them from the token's feature permissions. */
export const MADO_SCOPES = {
  lineageRead: 'lineage:read',
  lineageWrite: 'lineage:write',
  metricsRead: 'metrics:read',
} as const;

export function allowsAllMadoNamespaces(grant: MadoAccessTokenGrant): boolean {
  return grant.namespaces.includes(ALL_MADO_NAMESPACES);
}

export function allowsMadoNamespace(grant: MadoAccessTokenGrant, namespace: string): boolean {
  return allowsAllMadoNamespaces(grant) || grant.namespaces.includes(namespace);
}
