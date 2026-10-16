export function requireDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  if (environment.DATABASE_URL !== undefined)
    throw new Error('DATABASE_URL is not supported; use MMT_DATABASE_URL');
  if (!environment.MMT_DATABASE_URL) throw new Error('MMT_DATABASE_URL is required');
  return environment.MMT_DATABASE_URL;
}
