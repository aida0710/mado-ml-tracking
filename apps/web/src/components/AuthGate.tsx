import type { ReactNode } from 'react';
import { isApiError } from '@mado/design-system/http';
import { authApi } from '../api/auth';
import { useQuery } from '../hooks/useQuery';
import { AuthContext } from '../hooks/useAuth';
import { Resource } from './Feedback';
import { LoginPage } from '../pages/LoginPage';
import { RequiredPasswordChangePage } from '../pages/RequiredPasswordChangePage';
import { AuthReturn } from './AuthReturn';

export function AuthGate({ children }: { children: ReactNode }) {
  const session = useQuery({ key: 'auth', load: async (signal) => {
    const config = await authApi.config(signal);
    try {
      const { user, mustChangePassword } = await authApi.me(signal);
      return { config, user, mustChangePassword };
    } catch (error) {
      if (isApiError(error) && error.status === 401)
        return { config, user: null, mustChangePassword: false };
      throw error;
    }
  } });
  return (
    <Resource query={session}>
      {({ config, user, mustChangePassword }) =>
        // パスワードを変えるまでAPIはほかの要求をすべて断るので、アプリの画面は出さない。
        user && mustChangePassword ? (
          <RequiredPasswordChangePage onChanged={session.reload} />
        ) : user ? (
          <AuthContext.Provider value={{ user, reload: session.reload }}>
            <AuthReturn>{children}</AuthReturn>
          </AuthContext.Provider>
        ) : (
          <LoginPage config={config} onLogin={session.reload} />
        )
      }
    </Resource>
  );
}
