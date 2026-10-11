import type { PluginConnection } from '@mmt/contracts';
import { useLocale } from '../../i18n/useLocale';
import { pluginsText } from '../../i18n/plugins';
import { text } from '../../i18n/catalog';
import { useAuth } from '../../hooks/useAuth';
import { useProject } from '../../hooks/useProject';
import { useLegacyPluginSettings } from '../../hooks/useLegacyPluginSettings';
import { usePluginOutboxSummary } from '../../hooks/usePluginOutboxSummary';
import { ErrorNotice } from '../../components/Feedback';
import { PluginOutboxStatus } from '../../components/PluginOutboxStatus';

export function LegacyPluginSettings({ plugin, onSaved }: {
  plugin: PluginConnection;
  onSaved: (plugin: PluginConnection) => void;
}) {
  useLocale();
  const { project } = useProject();
  const { user } = useAuth();
  const settings = useLegacyPluginSettings({ projectId: project.id, plugin, onSaved });
  const outbox = usePluginOutboxSummary(project.id, plugin.id);
  return <>
    <h2>{plugin.name}</h2>
    <p className="notice warning">{pluginsText.unsupportedConnection}</p>
    <p className="muted mono">{plugin.id}</p>
    <p>{pluginsText.legacyEnabledState}: {plugin.enabled ? text.enabled : text.disabled}</p>
    {user.isAdmin && <>
      <form className="plugin-search" onSubmit={(event) => { event.preventDefault(); settings.saveName(); }}>
        <label className="field">
          <span>{text.name}</span>
          <input value={settings.name} required disabled={settings.pending}
            onChange={(event) => settings.setName(event.target.value)} />
        </label>
        <button className="button" disabled={settings.pending}>{text.save}</button>
      </form>
      <button className="button small" disabled={settings.pending || !plugin.enabled} onClick={settings.disable}>
        {pluginsText.disableIntegration}
      </button>
      <ErrorNotice message={settings.error} />
    </>}
    <PluginOutboxStatus summary={outbox} />
  </>;
}
