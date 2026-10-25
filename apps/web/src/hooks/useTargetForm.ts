import { useState } from 'react';
import type { ComputeTargetDetails } from '@mmt/contracts';
import { executionApi } from '../api/execution';
import type { FormValues } from '../types/form';
import {
  buildTargetCreate,
  buildTargetInput,
  newTargetFormValues,
  targetFormValues,
  updateTargetValues,
} from '../lib/targetInput';
import { useMutation } from './useMutation';

/** コンピュータのダイアログの値と保存。新しいコンピュータはPOST、編集したものはPATCH。 */
export function useTargetForm({
  target,
  canAddSshOrLocal,
}: {
  target?: ComputeTargetDetails;
  /** 新しいコンピュータをsshのコンピュータとして始めるか（全体管理者）、siteとして始めるか。 */
  canAddSshOrLocal: boolean;
}) {
  const [values, setValues] = useState(() =>
    target ? targetFormValues(target) : newTargetFormValues({ canAddSshOrLocal }),
  );
  const mutation = useMutation();
  function changeValues(next: FormValues) {
    setValues((previous) => updateTargetValues(previous, next));
    mutation.clearError();
  }
  function save(): Promise<ComputeTargetDetails | undefined> {
    return mutation.run(() =>
      target
        ? executionApi.updateTarget(target.id, buildTargetInput(values, target))
        : executionApi.createTarget(buildTargetCreate(values)),
    );
  }
  return { ...mutation, values, changeValues, save };
}
