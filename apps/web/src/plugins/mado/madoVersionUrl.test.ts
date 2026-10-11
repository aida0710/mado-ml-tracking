import { describe, expect, it } from 'vitest';
import type { DatasetVersion, PluginAvailability } from '@mmt/contracts';
import { getMadoVersionUrl } from './madoVersionUrl';

const externalId = '10000000-0000-4000-8000-000000000001';
const availability: PluginAvailability = {
  kind: 'mado', id: 'connection', enabled: true, configured: true,
  configRevision: 1, webUrl: 'https://mado.example/catalog/', canImport: false,
};
const version = {
  projectId: 'project',
  externalRef: { pluginId: 'connection', externalId, namespace: 'speech', name: 'training', version: 'v1' },
  metadata: { madoVersionId: 'metadata-is-not-trusted' },
} as unknown as DatasetVersion;

describe('Madoの固定バージョンを開くURL', () => {
  it('照合した接続のWeb URLと外部バージョンIDでバージョン画面を開く', () => {
    const url = new URL(getMadoVersionUrl({ projectId: 'project', availability, version })!);
    expect(url.origin).toBe('https://mado.example');
    expect(url.pathname).toBe('/catalog/lineage');
    expect(Object.fromEntries(url.searchParams)).toEqual({ mode: 'versions', versionId: externalId, node: externalId });
  });

  it.each([
    { enabled: false }, { configured: false }, { id: null },
    { id: 'another-connection' }, { webUrl: 'javascript:alert(1)' },
    { webUrl: 'https://user:password@mado.example' }, { webUrl: 'https://mado.example/?token=secret' },
  ])('利用できない連携や照合できない接続先はリンクを返さない: %j', (change) => {
    expect(getMadoVersionUrl({ projectId: 'project', availability: { ...availability, ...change }, version })).toBeNull();
  });

  it('別ProjectのバージョンとmetadataだけのMado情報をリンクに使わない', () => {
    expect(getMadoVersionUrl({ projectId: 'other', availability, version })).toBeNull();
    expect(getMadoVersionUrl({ projectId: 'project', availability, version: { ...version, externalRef: null } })).toBeNull();
    expect(getMadoVersionUrl({ projectId: 'project', availability, version: {
      ...version, externalRef: { ...version.externalRef!, externalId: '../../untrusted' },
    } })).toBeNull();
  });
});
