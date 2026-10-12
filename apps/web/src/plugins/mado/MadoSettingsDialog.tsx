import type { PluginConnection } from '@mmt/contracts';
import { useProject } from '../../hooks/useProject';
import { useMadoPluginForm } from '../../hooks/useMadoPluginForm';
import { Dialog } from '../../components/Dialog';
import { ErrorNotice } from '../../components/Feedback';
import { FormFields } from '../../components/FormFields';
import { useLocale } from '../../i18n/useLocale';
import { pluginsText } from '../../i18n/plugins';
import { text } from '../../i18n/catalog';

export function MadoSettingsDialog({ plugin, onClose, onSaved }: {
  plugin: PluginConnection | null;
  onClose: () => void;
  onSaved: (plugin: PluginConnection) => void;
}) {
  useLocale();
  const { project } = useProject();
  const form = useMadoPluginForm({ projectId: project.id, plugin });
  const configured = plugin?.credentialsConfigured;
  return <Dialog title={pluginsText.madoSettings} onClose={onClose} busy={form.pending}>
    <form onSubmit={(event) => {
      event.preventDefault();
      void form.save().then((saved) => { if (saved) onSaved(saved); });
    }} data-testid="plugin-edit-form">
      <p className="muted">{plugin ? pluginsText.madoSavedSecretsHint : pluginsText.madoInitialDisabledHint}</p>
      {plugin?.secretStorageAvailable === false && <p className="notice warning">{pluginsText.secretStorageUnavailable}</p>}
      <fieldset disabled={form.pending}>
        <FormFields fields={[
          { name: 'name', label: text.name, required: true },
          { name: 'apiUrl', label: pluginsText.madoApiUrl, type: 'url', required: true },
          { name: 'webUrl', label: pluginsText.madoWebUrl, type: 'url', required: true },
          { name: 'lineageUrl', label: pluginsText.madoLineageUrl, type: 'url', hint: pluginsText.madoLineageUrlHint },
          { name: 'namespaces', label: pluginsText.madoNamespaces, type: 'textarea', required: true, hint: pluginsText.madoNamespacesHint },
          { name: 'jobNamespace', label: pluginsText.madoJobNamespace, required: true },
          { name: 'storageSystemKey', label: pluginsText.madoStorageSystemKey, required: true },
          { name: 'readToken', label: pluginsText.madoReadToken, type: 'password', hint: configured?.readToken ? pluginsText.savedCredentialHint : pluginsText.readCredentialHint },
          { name: 'lineageToken', label: pluginsText.madoLineageToken, type: 'password', hint: configured?.lineageToken ? pluginsText.savedCredentialHint : pluginsText.writeCredentialHint },
          { name: 'metricsToken', label: pluginsText.madoMetricsToken, type: 'password', hint: configured?.metricsToken ? pluginsText.savedCredentialHint : pluginsText.optionalCredentialHint, visible: (values) => values.removeMetricsToken !== 'true' },
          ...(configured?.metricsToken ? [{ name: 'removeMetricsToken', label: pluginsText.madoRemoveMetricsToken, type: 'checkbox' as const }] : []),
        ]} values={form.values} onChange={form.changeValues} />
      </fieldset>
      <ErrorNotice message={form.error} />
      <footer>
        <button type="button" className="button" disabled={form.pending} onClick={onClose}>{text.cancel}</button>
        <button className="button primary" disabled={form.pending}>{form.pending ? text.loading : text.save}</button>
      </footer>
    </form>
  </Dialog>;
}
