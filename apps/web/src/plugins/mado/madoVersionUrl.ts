import { isSameUuid, type DatasetVersion, type PluginAvailability } from '@mmt/contracts';

// mado S3 Data CatalogはバージョンのノードにUUIDを振る。名前や信頼できないメタデータは
// 遷移先のIDにしない。
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
    // mado S3 Data Catalogのノードの選択は、正規形のUUIDの文字列とルートのパラメータを比べる。
    const versionId = reference.externalId.toLowerCase();
    url.searchParams.set('mode', 'versions');
    url.searchParams.set('versionId', versionId);
    url.searchParams.set('node', versionId);
    return url.href;
  } catch {
    return null;
  }
}
