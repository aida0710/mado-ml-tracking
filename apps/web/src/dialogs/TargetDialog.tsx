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

/** What the dialog reads before it opens: whether local targets exist here, and the launchers. */
async function loadTargetChoices(signal: AbortSignal) {
  const [auth, launchers] = await Promise.all([authApi.config(signal), launchersApi.list(signal)]);
  return { auth, launchers };
}

/**
 * Adds or edits a computer and chooses its visibility. Whoever adds one owns it: a global
 * administrator adds ssh, local and site targets (ssh and local in two steps, NewComputerDialog),
 * a researcher sites.
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
  const choices = useQuery('target-dialog-choices', loadTargetChoices);
  const title = target ? text.editTarget : text.newTarget;
  return (
    <QueryDialog title={title} onClose={onClose} query={choices}>
      {({ auth, launchers }) => {
        // ssh and local computers are set up in two parts from a worker's check; sites in one form.
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

/** A site's form, in one step; also the form of a researcher who adds one. */
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
