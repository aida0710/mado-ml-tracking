import { useState } from 'react';
import type { ServiceAccount } from '@mmt/contracts';
import { useMutation } from '../hooks/useMutation';
import { useProject } from '../hooks/useProject';
import type { ServiceAccountsState } from '../hooks/useServiceAccounts';
import { ResponsiveTable } from './ResponsiveTable';
import { ErrorNotice, Resource } from './Feedback';
import { ConfirmDialog } from './ConfirmDialog';
import { ServiceAccountDialog } from '../dialogs/ServiceAccountDialog';
import { TokenDialog } from '../dialogs/TokenDialog';
import { formatDate } from '../lib/format';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { serviceAccountsTextTemplates } from '../i18n/serviceAccounts';

/**
 * ProjectのService Account。作成、Role、無効化、tokenの発行。管理できるのはProject adminだけなので、
 * ほかの人にはこの欄を隠す。
 */
export function ProjectServiceAccounts({ access }: { access: ServiceAccountsState }) {
  useLocale();
  const { project, isProjectAdmin } = useProject();
  const [editing, setEditing] = useState<ServiceAccount | 'new' | null>(null);
  const [issuingFor, setIssuingFor] = useState<ServiceAccount | null>(null);
  const [disabling, setDisabling] = useState<ServiceAccount | null>(null);
  if (!isProjectAdmin) return null;
  const { serviceAccounts, projectTokens } = access;
  const reloadAll = () => {
    serviceAccounts.reload();
    projectTokens.reload();
  };
  return (
    <section className="settings-section">
      <div className="section-heading">
        <h2>{text.serviceAccounts}</h2>
        <button className="button small" onClick={() => setEditing('new')}>
          {text.newServiceAccount}
        </button>
      </div>
      <p className="muted">{text.serviceAccountsDescription}</p>
      <Resource query={serviceAccounts}>
        {(items) => (
          <ResponsiveTable
            rows={items}
            rowKey={(account) => account.id}
            empty={text.serviceAccountsEmpty}
            columns={[
              {
                key: 'name',
                priority: 'primary',
                header: text.name,
                render: (account) => account.name,
              },
              {
                key: 'description',
                priority: 'secondary',
                header: text.description,
                render: (account) => account.description,
              },
              {
                key: 'role',
                priority: 'primary',
                header: text.role,
                render: (account) =>
                  account.role ? text[account.role] : text.serviceAccountRoleMissing,
              },
              {
                key: 'status',
                priority: 'primary',
                header: text.status,
                render: (account) =>
                  account.status === 'active'
                    ? text.serviceAccountActive
                    : text.serviceAccountDisabled,
              },
              {
                key: 'createdAt',
                priority: 'secondary',
                header: text.created,
                render: (account) => formatDate(account.createdAt),
              },
              {
                key: 'actions',
                priority: 'secondary',
                header: text.actions,
                render: (account) => (
                  <div className="access-actions">
                    <button className="button small" onClick={() => setEditing(account)}>
                      {text.edit}
                    </button>
                    {account.status === 'active' ? (
                      <>
                        <button
                          className="button small"
                          disabled={!account.role}
                          onClick={() => setIssuingFor(account)}
                        >
                          {text.issueToken}
                        </button>
                        <button
                          className="button small danger"
                          onClick={() => setDisabling(account)}
                        >
                          {text.disableServiceAccount}
                        </button>
                      </>
                    ) : (
                      <EnableButton
                        onEnable={() =>
                          access.updateServiceAccount(account.id, { status: 'active' })
                        }
                        onEnabled={reloadAll}
                      />
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Resource>
      {editing && (
        <ServiceAccountDialog
          serviceAccount={editing === 'new' ? undefined : editing}
          onSave={(input) =>
            editing === 'new'
              ? access.createServiceAccount(input)
              : access.updateServiceAccount(editing.id, {
                  description: input.description,
                  role: input.role,
                })
          }
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reloadAll();
          }}
        />
      )}
      {issuingFor && (
        <TokenDialog
          project={project}
          owner={{
            serviceAccount: issuingFor,
            issue: (request) => access.issueServiceAccountToken(issuingFor.id, request),
          }}
          onClose={() => setIssuingFor(null)}
          onCreated={projectTokens.reload}
        />
      )}
      {disabling && (
        <ConfirmDialog
          title={text.disableServiceAccount}
          message={serviceAccountsTextTemplates.disableServiceAccountConfirm(disabling.name)}
          confirmLabel={text.disableServiceAccount}
          destructive
          onClose={() => setDisabling(null)}
          onConfirm={() => access.updateServiceAccount(disabling.id, { status: 'disabled' })}
          onConfirmed={() => {
            setDisabling(null);
            reloadAll();
          }}
        />
      )}
    </section>
  );
}

// 有効にするとアカウントの既存のtokenが戻るだけで壊すものは無いので、確認しない。
function EnableButton({
  onEnable,
  onEnabled,
}: {
  onEnable: () => Promise<unknown>;
  onEnabled: () => void;
}) {
  useLocale();
  const mutation = useMutation();
  return (
    <>
      <button
        className="button small"
        disabled={mutation.pending}
        onClick={() =>
          void mutation.run(onEnable).then((result) => {
            if (result !== undefined) onEnabled();
          })
        }
      >
        {text.enableServiceAccount}
      </button>
      <ErrorNotice message={mutation.error} />
    </>
  );
}
