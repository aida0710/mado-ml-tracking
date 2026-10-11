import { useState } from 'react';
import type { Hook, HookCreated } from '@mmt/contracts';
import type { HookCatalog } from '../types/hooks';
import { useHookForm } from '../hooks/useHookForm';
import { useProject } from '../hooks/useProject';
import { Dialog } from '../components/Dialog';
import { HookFields } from '../components/HookFields';
import { CopyableValue } from '../components/CopyableValue';
import { ErrorNotice } from '../components/Feedback';
import { text } from '../i18n/catalog';
import { copyHookValues } from '../lib/hookInput';
import { hookWebhookUrl } from '../lib/hookDisplay';
import { hookWebhookSignatureHints, hooksTextTemplates } from '../i18n/hooks';

/** One value of the new webhook, with a copy button. */
function WebhookValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="field">
      <span>{label}</span>
      <CopyableValue value={value} />
    </div>
  );
}

/**
 * The secret of a new webhook hook. The API keeps it encrypted and never returns it again, so it
 * is shown here once, next to the path the sender posts to.
 */
function WebhookCreated({ created, onClose }: { created: HookCreated; onClose: () => void }) {
  const signature = created.hook.webhookSignature;
  return (
    <Dialog title={text.hookWebhookCreated} onClose={onClose}>
      <p className="notice">{text.hookWebhookSecretOnce}</p>
      <div className="hook-webhook-values">
        {created.webhookSecret && (
          <WebhookValue label={text.hookWebhookSecret} value={created.webhookSecret} />
        )}
        {created.webhookPath && (
          <WebhookValue
            label={text.hookWebhookUrl}
            value={hookWebhookUrl(created.hook.id, window.location.origin)}
          />
        )}
        <p className="muted">{text.hookWebhookPathHint}</p>
        {signature && <p className="muted">{hookWebhookSignatureHints[signature]}</p>}
      </div>
      <footer>
        <button className="button primary" onClick={onClose}>
          {text.close}
        </button>
      </footer>
    </Dialog>
  );
}

/**
 * Creates a hook, from the defaults or as a copy of `source`. onCreated runs as soon as the API
 * has it (the list can refresh behind the secret); onClose ends the dialog, after the secret of a
 * webhook hook has been shown.
 */
export function HookDialog({
  catalog,
  source,
  onCreated,
  onClose,
}: {
  catalog: HookCatalog;
  /** The hook whose settings the form starts from ([複製して新しく作る]). */
  source?: Hook;
  onCreated: (hook: Hook) => void;
  onClose: () => void;
}) {
  const { project } = useProject();
  const form = useHookForm({
    projectId: project.id,
    catalog,
    initialValues: source && copyHookValues(source, hooksTextTemplates.hookCopyName(source.name)),
  });
  const [created, setCreated] = useState<HookCreated | null>(null);
  if (created) return <WebhookCreated created={created} onClose={onClose} />;
  return (
    <Dialog
      title={source ? text.hookCopyTitle : text.newHook}
      onClose={onClose}
      busy={form.pending}
      wide
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.save().then((result) => {
            if (!result) return;
            onCreated(result.hook);
            if (result.webhookSecret) setCreated(result);
            else onClose();
          });
        }}
      >
        {source && (
          <p className="notice" role="status">
            {text.hookCopyHint}
            {source.trigger === 'webhook' && ` ${text.hookCopyWebhookHint}`}
          </p>
        )}
        <fieldset disabled={form.pending}>
          <HookFields values={form.values} catalog={catalog} onChange={form.changeValues} />
        </fieldset>
        <ErrorNotice message={form.error} />
        <footer>
          <button type="button" className="button" disabled={form.pending} onClick={onClose}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={form.pending}>
            {form.pending ? text.loading : text.create}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
