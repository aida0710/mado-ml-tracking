import { useState } from 'react';
import { promotionApi } from '../api/promotion';
import { useQuery } from './useQuery';
import { useMutation } from './useMutation';

// Projectの昇格policy、選んだもの、その有効・無効の切り替え。
export function usePromotionPolicies(projectId: string) {
  const policies = useQuery({ key: `${projectId}:promotion-policies`, load: (signal) =>
    promotionApi.policies(projectId, signal),
  });
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const mutation = useMutation();
  async function setEnabled(policyId: string, enabled: boolean) {
    const saved = await mutation.run(() =>
      promotionApi.setPolicyEnabled(projectId, policyId, enabled),
    );
    if (saved) policies.reload();
  }
  return {
    policies,
    selectedPolicyId,
    selectPolicy: setSelectedPolicyId,
    isCreating,
    startCreating: () => setIsCreating(true),
    stopCreating: () => setIsCreating(false),
    setEnabled,
    pending: mutation.pending,
    error: mutation.error,
  };
}
