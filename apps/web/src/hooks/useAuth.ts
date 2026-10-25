import { createContext, useContext } from 'react';
import type { User } from '@mmt/contracts';

/** ログイン中の利用者。利用者が必要な画面をすべて囲むAuthGateが渡す。 */
export const AuthContext = createContext<{ user: User; reload: () => void } | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('Auth context is required');
  return context;
}
