import type { AuthConfig, ComputeTargetDetails, Launcher } from '@mmt/contracts';
import { authApi } from '../api/auth';
import { launchersApi } from '../api/launchers';
import { useAuth } from '../hooks/useAuth';
import { useQuery } from '../hooks/useQuery';
import { useTargetForm } from '../hooks/useTargetForm';
import { Dialog } from '../components/Dialog';
import { ErrorNotice } from '../components/Feedback';
import { QueryDialog } from '../components/QueryDialog';
import { TargetFields } from '../components/TargetFields';
import { ComputerEditDialog } from './ComputerEditDialog';
import { NewComputerDialog } from './NewComputerDialog';
import { canAddSshOrLocalTarget } from '../lib/permissions';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/** ダイアログを開く前に読むもの。この環境でlocalのコンピュータを使えるかと、ランチャー。 */
async function loadTargetChoices(signal: AbortSignal) {
  const [auth, launchers] = await Promise.all([authApi.config(signal), launchersApi.list(signal)]);
  return { auth, launchers };
}

/**
 * コンピュータを足す・編集し、公開範囲を選ぶ。足した人が所有者になる。全体管理者はssh、local、
 * siteを足し（ssh・localは2段で。NewComputerDialog）、研究者はsiteを足す。
 */
export function TargetDialog({
  onClose,
  onSaved,
  target,
}: {
  onClose: () => void;
  onSaved: (target: ComputeTargetDetails) => void;
  target?: ComputeTargetDetails;
}) {
  useLocale();
  const { user } = useAuth();
  const choices = useQuery({ key: 'target-dialog-choices', load: loadTargetChoices });
  const title = target ? text.editTarget : text.newTarget;
  return (
    <QueryDialog title={title} onClose={onClose} query={choices}>
      {({ auth, launchers }) => {
        // ssh・localのコンピュータはworkerの確認をもとに2つの部分で設定し、siteは1つのフォームで設定する。
        if (target && target.executor !== 'site')
          return (
            <ComputerEditDialog auth={auth} target={target} onClose={onClose} onSaved={onSaved} />
          );
        if (!target && canAddSshOrLocalTarget(user))
          return (
            <NewComputerDialog
              auth={auth}
              launchers={launchers}
              onClose={onClose}
              onSaved={onSaved}
            />
          );
        return (
          <TargetForm
            title={title}
            target={target}
            auth={auth}
            launchers={launchers}
            onClose={onClose}
            onSaved={onSaved}
          />
        );
      }}
    </QueryDialog>
  );
}

/** siteのフォーム（1段）。研究者がsiteを足すときもこのフォーム。 */
function TargetForm({
  title,
  target,
  auth,
  launchers,
  onClose,
  onSaved,
}: {
  title: string;
  target?: ComputeTargetDetails;
  auth: AuthConfig;
  launchers: Launcher[];
  onClose: () => void;
  onSaved: (target: ComputeTargetDetails) => void;
}) {
  useLocale();
  const { user } = useAuth();
  const canAddSshOrLocal = canAddSshOrLocalTarget(user);
  const form = useTargetForm({ target, canAddSshOrLocal });
  return (
    <Dialog title={title} onClose={onClose} dismissible={!form.pending} size="wide">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.save().then((saved) => {
            if (saved) onSaved(saved);
          });
        }}
      >
        <fieldset disabled={form.pending}>
          <TargetFields
            values={form.values}
            onChange={form.changeValues}
            target={target}
            canAddSshOrLocal={canAddSshOrLocal}
            allowLocal={auth.mode === 'development' || target?.executor === 'local'}
            launchers={launchers}
          />
        </fieldset>
        <ErrorNotice message={form.error} />
        <footer>
          <button type="button" className="button" onClick={onClose} disabled={form.pending}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={form.pending}>
            {form.pending ? text.loading : text.save}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
