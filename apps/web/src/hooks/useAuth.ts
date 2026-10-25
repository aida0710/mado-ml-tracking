import { createContext, useContext } from 'react';
import type { User } from '@mmt/contracts';

/** The signed-in user, provided by AuthGate around every screen that needs one. */
export const AuthContext = createContext<{ user: User; reload: () => void } | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('Auth context is required');
  return context;
}
