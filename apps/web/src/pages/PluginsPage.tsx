import { useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import type { PluginConnection } from '@mmt/contracts';
import { useLocale } from '../i18n/useLocale';
import { useProject } from '../hooks/useProject';
import { useAuth } from '../hooks/useAuth';
import { usePluginConnections } from '../hooks/usePluginConnections';
import { PageHeader } from '../components/PageHeader';
import { Resource } from '../components/Feedback';
import { ResponsiveTable } from '../components/ResponsiveTable';
import { RegistryLayout } from '../components/RegistryLayout';
import { builtinPluginViews } from '../plugins/builtinPluginViews';
import { LegacyPluginSettings } from '../plugins/legacy/LegacyPluginSettings';
import { getPluginConnectionKey } from '../lib/pluginConnection';
import { canManagePlugins, isGlobalAdmin } from '../lib/permissions';
import { text } from '../i18n/catalog';
import { pluginsText } from '../i18n/plugins';

interface PluginSettingsItem {
  id: string;
  name: string;
  plugin: PluginConnection | null;
  kind: string;
}

// New built-in connections coexist with existing connections and keep a distinct saved UUID.
const NEW_MADO_CONNECTION_SELECTION = 'new:mado';

export function PluginsPage() {
  useLocale();
  const { project } = useProject();
  const { user } = useAuth();
  if (!canManagePlugins(project.role, isGlobalAdmin(user))) return (
    <section className="page management-page">
      <PageHeader title={text.plugins} eyebrow={project.name} />
      <p className="notice">{text.pluginsAdminOnly}</p>
    </section>
  );
  return <PluginConnections />;
}

function PluginConnections() {
  useLocale();
  const { project } = useProject();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const plugins = usePluginConnections(project.id);
  return (
    <section className="page management-page">
      <PageHeader title={text.plugins} eyebrow={project.name} actions={
        <>
          {user.isAdmin && <button className="button" onClick={() => setParams({ id: NEW_MADO_CONNECTION_SELECTION })}>
            <Plus size={15} />
            {pluginsText.madoAddConnection}
          </button>}
          <button className="icon-button" aria-label={text.refresh} onClick={plugins.reload}>
            <RefreshCw size={17} />
          </button>
        </>
      } />
      <p className="muted">{pluginsText.pluginsAbout}</p>
      <Resource query={plugins}>
        {(connections) => {
          const items: PluginSettingsItem[] = connections.map((plugin) => ({
            id: plugin.id, name: plugin.name, plugin, kind: plugin.kind,
          }));
          for (const view of builtinPluginViews) {
            if (!items.some((item) => item.kind === view.kind))
              items.push({ id: view.kind, name: view.name, plugin: null, kind: view.kind });
          }
          if (params.get('id') === NEW_MADO_CONNECTION_SELECTION) {
            items.push({ id: NEW_MADO_CONNECTION_SELECTION, name: pluginsText.madoNewConnection, plugin: null, kind: 'mado' });
          }
          const selected = items.find((item) => item.id === params.get('id')) ?? items[0];
          const view = builtinPluginViews.find((candidate) => candidate.kind === selected?.kind);
          return <RegistryLayout list={
            <ResponsiveTable rows={items} rowKey={(item) => item.id} selectedKey={selected?.id} columns={[
              { key: 'name', priority: 'primary', header: text.name, render: (item) => (
                <button className="link-button" onClick={() => setParams({ id: item.id })}>{item.name}</button>
              ) },
              { key: 'configured', priority: 'primary', header: pluginsText.configuration, render: (item) =>
                item.plugin?.configurationStatus === 'ready' ? pluginsText.configured :
                  item.plugin?.configurationStatus === 'unsupported' ? pluginsText.unsupported :
                    item.plugin ? pluginsText.migrationPending : pluginsText.notConfigured },
              { key: 'enabled', priority: 'primary', header: text.enabled, render: (item) =>
                item.plugin?.enabled ? text.enabled : text.disabled },
            ]} />
          }>
            {selected && view ? <view.Settings
              key={selected.plugin ? getPluginConnectionKey(selected.plugin) : `${project.id}:${selected.id}`}
              plugin={selected.plugin}
              onSaved={(plugin) => { plugins.onSaved(plugin); setParams({ id: plugin.id }); }}
            /> : selected?.plugin && <LegacyPluginSettings
              key={getPluginConnectionKey(selected.plugin)} plugin={selected.plugin}
              onSaved={plugins.onSaved}
            />}
          </RegistryLayout>;
        }}
      </Resource>
    </section>
  );
}
