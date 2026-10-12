import { useState } from 'react';
import type { PluginConnection, PluginDataset } from '@mmt/contracts';
import { pluginsApi } from '../api/plugins';
import { useMutation } from './useMutation';
import { useMountedRef } from './useMountedRef';

export function useMadoDatasetSearch({ projectId, plugin }: { projectId: string; plugin: PluginConnection }) {
  const [query, setQuery] = useState('');
  const [datasets, setDatasets] = useState<PluginDataset[] | null>(null);
  const [imported, setImported] = useState<{ name: string; version: string } | null>(null);
  const mounted = useMountedRef();
  const mutation = useMutation();
  function search() {
    setImported(null);
    setDatasets(null);
    void mutation.run(async () => {
      const found = await pluginsApi.searchDatasets(projectId, plugin.id, {
        query, expectedRevision: plugin.configRevision,
      });
      if (mounted.current) setDatasets(found);
    });
  }
  function importDataset(dataset: PluginDataset) {
    setImported(null);
    void mutation.run(async () => {
      const version = await pluginsApi.importDataset(projectId, plugin.id, {
        externalId: dataset.externalId, expectedRevision: plugin.configRevision,
      });
      if (mounted.current) setImported({ name: version.name, version: version.version });
    });
  }
  return { query, setQuery, datasets, imported, search, importDataset, pending: mutation.pending, error: mutation.error };
}
