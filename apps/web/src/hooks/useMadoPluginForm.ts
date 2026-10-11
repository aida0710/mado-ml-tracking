import { useState } from 'react';
import type { PluginConnection } from '@mmt/contracts';
import { pluginsApi } from '../api/plugins';
import type { FormValues } from '../types/form';
import { getFieldValue } from '../lib/formValues';
import { getMadoPluginConfig, getMadoPluginCredentials, getMadoPluginFormValues } from '../lib/madoPluginForm';
import { useMutation } from './useMutation';

export function useMadoPluginForm({ projectId, plugin }: { projectId: string; plugin: PluginConnection | null }) {
  const [values, setValues] = useState(() => getMadoPluginFormValues(plugin));
  const mutation = useMutation();
  function changeValues(next: FormValues) {
    setValues(next);
    mutation.clearError();
  }
  function save() {
    const input = {
      name: getFieldValue(values, 'name').trim(),
      config: getMadoPluginConfig(values),
      credentials: getMadoPluginCredentials(values),
    };
    return mutation.run(() => plugin
      ? pluginsApi.update(projectId, plugin.id, { ...input, expectedRevision: plugin.configRevision })
      : pluginsApi.create(projectId, { ...input, kind: 'mado', enabled: false }),
    );
  }
  return { ...mutation, values, changeValues, save };
}
