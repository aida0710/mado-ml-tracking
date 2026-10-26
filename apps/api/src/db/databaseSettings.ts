export function requireDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  if (!environment.MMT_DATABASE_URL) throw new Error('MMT_DATABASE_URL is required');
  return environment.MMT_DATABASE_URL;
}
