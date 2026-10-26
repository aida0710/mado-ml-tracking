import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { AdminUser } from '@mmt/contracts';
import { UsersTable } from './UsersTable';
import { text } from '../../i18n/catalog';

const ssoUser: AdminUser = {
  id: 'u1',
  email: 'sso@example.test',
  displayName: 'SSOの人',
  isAdmin: false,
  username: null,
  status: 'active',
  authSources: ['oidc'],
  kind: 'human',
  lastLoginAt: null,
  createdAt: '2026-10-01T00:00:00Z',
  serviceAccountProject: null,
};

function renderTable(ssoManagesGlobalRole: boolean): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <UsersTable
        users={[ssoUser]}
        currentUserId="someone-else"
        lastActiveAdminId={null}
        ssoManagesGlobalRole={ssoManagesGlobalRole}
        onAction={() => undefined}
      />
    </MemoryRouter>,
  );
}

describe('UsersTable', () => {
  it('Authentikのgroupが全体管理者を決めるときは、SSOの人を管理者にする操作を出さない', () => {
    const markup = renderTable(true);
    expect(markup).toContain(text.userAdminFromSso);
    expect(markup).not.toContain(`>${text.userMakeAdmin}<`);
  });

  it('対応表が空なら、SSOの人もここで管理者にできる', () => {
    const markup = renderTable(false);
    expect(markup).not.toContain(text.userAdminFromSso);
    expect(markup).toContain(`>${text.userMakeAdmin}<`);
  });
});
