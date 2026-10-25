import { useState } from 'react';
import type { Hook, HookCreated } from '@mmt/contracts';
import type { HookCatalog } from '../types/hooks';
import { useHookForm } from '../hooks/useHookForm';
import { useProject } from '../hooks/useProject';
import { Dialog } from '../components/Dialog';
import { HookFields } from '../components/HookFields';
import { CopyableValue } from '../components/CopyableValue';
import { ErrorNotice } from '../components/Feedback';
import { copyHookValues } from '../lib/hookInput';
import { hookWebhookUrl } from '../lib/hookDisplay';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { hookWebhookSignatureHints, hooksTextTemplates } from '../i18n/hooks';

/** 新しいwebhookの値の1つ。コピーのボタンつき。 */
function WebhookValue({ label, value }: { label: string; value: string }) {
  useLocale();
  return (
    <div className="field">
      <span>{label}</span>
      <CopyableValue value={value} />
    </div>
  );
}

/**
 * 新しいwebhookのフックの署名の秘密鍵。APIは暗号化して持ち、二度と返さないので、ここで、
 * 送り手がpostするパスと並べて一度だけ見せる。
 */
function WebhookCreated({ created, onClose }: { created: HookCreated; onClose: () => void }) {
  useLocale();
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
 * 既定値から、または`source`のコピーとしてフックを作る。onCreatedはAPIがフックを受け取った
 * 時点で呼ぶ（秘密鍵の後ろで一覧を更新できる）。onCloseはダイアログを終えるときに呼ぶ。
 * webhookのフックなら、秘密鍵を見せたあとになる。
 */
export function HookDialog({
  catalog,
  source,
  onCreated,
  onClose,
}: {
  catalog: HookCatalog;
  /** フォームの初期値にする設定を持つフック（[複製して新しく作る]）。 */
  source?: Hook;
  onCreated: (hook: Hook) => void;
  onClose: () => void;
}) {
  useLocale();
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
      dismissible={!form.pending}
      size="wide"
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
