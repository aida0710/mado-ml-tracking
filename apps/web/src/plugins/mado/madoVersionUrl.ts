import { isSameUuid, type DatasetVersion, type PluginAvailability } from '@mmt/contracts';

// Mado assigns UUIDs to version nodes; names and untrusted metadata are not navigation IDs.
const VERSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getMadoVersionUrl({
  projectId,
  availability,
  version,
}: {
  projectId: string;
  availability: PluginAvailability;
  version: DatasetVersion;
}): string | null {
  const reference = version.externalRef;
  if (!availability.enabled || !availability.configured || availability.kind !== 'mado' ||
      !availability.id || !availability.webUrl || version.projectId !== projectId ||
      !reference || !isSameUuid(availability.id, reference.pluginId) ||
      !VERSION_ID_PATTERN.test(reference.externalId)) return null;
  try {
    const base = new URL(availability.webUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash)
      return null;
    const url = new URL(`${base.pathname.replace(/\/$/, '')}/lineage`, base);
    // Mado's node selection compares its canonical UUID string with the route parameter.
    const versionId = reference.externalId.toLowerCase();
    url.searchParams.set('mode', 'versions');
    url.searchParams.set('versionId', versionId);
    url.searchParams.set('node', versionId);
    return url.href;
  } catch {
    return null;
  }
}
