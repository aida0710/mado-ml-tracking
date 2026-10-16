import { useState } from 'react';
import type { PluginConnection } from '@mmt/contracts';
import { pluginsApi } from '../api/plugins';
import { useMutation } from './useMutation';
import { useMountedRef } from './useMountedRef';

type ConnectionSuccess = { kind: 'checked' } | { kind: 'queued'; count: number };

export function useMadoPluginConnection({ projectId, plugin, onSaved, onRetried }: {
  projectId: string;
  plugin: PluginConnection | null;
  onSaved: (plugin: PluginConnection) => void;
  onRetried: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [success, setSuccess] = useState<ConnectionSuccess | null>(null);
  const mounted = useMountedRef();
  const mutation = useMutation();
  function runConnectionOperation<T>(operation: () => Promise<T>, onSucceeded: (operationValue: T) => void) {
    setSuccess(null);
    void mutation.run(async () => {
      const operationValue = await operation();
      if (mounted.current) onSucceeded(operationValue);
    });
  }
  function check() {
    if (!plugin) return;
    // The checked connection carries the access token's grant read from Mado.
    runConnectionOperation(() => pluginsApi.check(projectId, plugin.id), (checkedPlugin) => {
      setChecked(true);
      setSuccess({ kind: 'checked' });
      onSaved(checkedPlugin);
    });
  }
  function toggle() {
    if (!plugin) return;
    runConnectionOperation(() => pluginsApi.update(projectId, plugin.id, { enabled: !plugin.enabled }), onSaved);
  }
  function retry() {
    if (!plugin) return;
    runConnectionOperation(() => pluginsApi.retryEvents(projectId, plugin.id), (retried) => {
      setSuccess({ kind: 'queued', count: retried.queued });
      onRetried();
    });
  }
  function completeMigration() {
    if (!plugin) return;
    runConnectionOperation(() => pluginsApi.completeMigration(projectId, plugin.id, plugin.configRevision), onSaved);
  }
  return { checked, success, pending: mutation.pending, error: mutation.error, check, toggle, retry, completeMigration };
}
