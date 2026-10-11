import { useState } from 'react';
import type { ModelAutomationRule } from '@mmt/contracts';
import { automationApi } from '../api/automation';
import type { AutomationCatalog } from '../types/modelAutomation';
import type { FormValues } from '../types/form';
import { buildAutomationRuleInput, updateAutomationValues } from '../lib/modelAutomationInput';
import { useMutation } from './useMutation';

export function useAutomationRuleForm({
  projectId,
  catalog,
  initialValues,
}: {
  projectId: string;
  catalog: AutomationCatalog;
  initialValues: () => FormValues;
}) {
  const [values, setValues] = useState(initialValues);
  const mutation = useMutation();
  function changeValues(next: FormValues) {
    setValues((previous) => updateAutomationValues({ previous, next, catalog }));
    mutation.clearError();
  }
  function save(): Promise<ModelAutomationRule | undefined> {
    return mutation.run(() =>
      automationApi.createRule(projectId, buildAutomationRuleInput(values, catalog)),
    );
  }
  return { ...mutation, values, changeValues, save };
}
