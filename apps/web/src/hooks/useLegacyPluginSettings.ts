import { useState } from 'react';
import type { PluginConnection } from '@mmt/contracts';
import { pluginsApi } from '../api/plugins';
import { useMountedRef } from './useMountedRef';
import { useMutation } from './useMutation';

export function useLegacyPluginSettings({ projectId, plugin, onSaved }: {
  projectId: string;
  plugin: PluginConnection;
  onSaved: (plugin: PluginConnection) => void;
}) {
  const [name, setName] = useState(plugin.name);
  const mutation = useMutation();
  const mounted = useMountedRef();
  function save(change: { name: string } | { enabled: false }) {
    void mutation.run(async () => {
      const saved = await pluginsApi.update(projectId, plugin.id, change);
      if (mounted.current) onSaved(saved);
    });
  }
  return { name, setName, pending: mutation.pending, error: mutation.error,
    saveName: () => save({ name: name.trim() }), disable: () => save({ enabled: false }) };
}
