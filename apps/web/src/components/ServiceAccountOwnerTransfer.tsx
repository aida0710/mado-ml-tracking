import { useState } from 'react';
import type { ServiceAccount } from '@mmt/contracts';
import { accessApi } from '../api/access';
import { useQuery } from '../hooks/useQuery';
import type { SelectOption } from '../types/form';
import { FormFields } from './FormFields';
import { ConfirmDialog } from './ConfirmDialog';
import { ErrorNotice } from './Feedback';
import { withEmptyOption } from '../lib/catalogOptions';
import { getFieldValue } from '../lib/formValues';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * Project adminが自動実行ルールやフックをService Accountへ移管できるようにし、作成者がProjectを
 * 離れた後もJobを起動し続けられるようにする。所有者の候補と移管のしかたは呼び出し側が渡す。
 */
export function ServiceAccountOwnerTransfer({
  projectId,
  candidates,
  confirmMessage,
  noAccountsMessage,
  transfer,
  onTransferred,
}: {
  projectId: string;
  candidates: (accounts: readonly ServiceAccount[]) => SelectOption[];
  confirmMessage: (accountName: string) => string;
  noAccountsMessage: string;
  transfer: (serviceAccountId: string) => Promise<unknown>;
  onTransferred: () => void;
}) {
  useLocale();
  const accounts = useQuery({ key: `${projectId}:service-accounts:owner-transfer`, load: (signal) =>
    accessApi.serviceAccounts(projectId, signal),
  });
  const [values, setValues] = useState<Record<string, string>>({ serviceAccount: '' });
  const [isConfirming, setIsConfirming] = useState(false);
  const [isTransferred, setIsTransferred] = useState(false);
  const options = candidates(accounts.value ?? []);
  const selectedId = getFieldValue(values, 'serviceAccount');
  const selectedLabel = options.find((option) => option.value === selectedId)?.label ?? selectedId;
  return (
    <section className="automation-owner-transfer">
      <h4>{text.ownerTransfer}</h4>
      <ErrorNotice message={accounts.error} retry={accounts.reload} />
      {accounts.value && !options.length ? (
        <p className="muted">{noAccountsMessage}</p>
      ) : (
        <>
          <FormFields
            fields={[
              {
                name: 'serviceAccount',
                label: text.ownerTransferTarget,
                type: 'select',
                options: withEmptyOption(options),
              },
            ]}
            values={values}
            onChange={(next) => {
              setValues({ serviceAccount: getFieldValue(next, 'serviceAccount') });
              setIsTransferred(false);
            }}
          />
          <button
            className="button small"
            disabled={!selectedId}
            onClick={() => setIsConfirming(true)}
          >
            {text.ownerTransfer}
          </button>
        </>
      )}
      {isTransferred && <p className="notice">{text.ownerTransferred}</p>}
      {isConfirming && (
        <ConfirmDialog
          title={text.ownerTransfer}
          message={confirmMessage(selectedLabel)}
          confirmLabel={text.ownerTransfer}
          onConfirm={() => transfer(selectedId)}
          onConfirmed={() => {
            setIsConfirming(false);
            setIsTransferred(true);
            setValues({ serviceAccount: '' });
            onTransferred();
          }}
          onClose={() => setIsConfirming(false)}
        />
      )}
    </section>
  );
}
