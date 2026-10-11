import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PluginConnection, PluginManifest } from '@mmt/contracts';
import { administrationApi } from '../api/administration';
import { useProject } from '../hooks/useProject';
import { useAuth } from '../hooks/useAuth';
import { useMutation } from '../hooks/useMutation';
import { getPluginConnectionKey } from '../lib/pluginConnection';
import { DetailsList, JsonDetails } from './JsonDetails';
import { PluginDialog } from '../dialogs/PluginDialog';
import { ErrorNotice } from './Feedback';
import { PluginStorageMetrics } from './PluginStorageMetrics';
import { PluginOutboxStatus } from './PluginOutboxStatus';
import { PluginDatasetSearch } from './PluginDatasetSearch';
import { usePluginOutboxSummary } from '../hooks/usePluginOutboxSummary';
import { text } from '../i18n/catalog';
import { pluginsText, pluginsTextTemplates } from '../i18n/plugins';

/**
 * One plugin connection: whether the API server can reach it, its manifest, delivery state and
 * dataset search. Calls to the plugin wait for the server's token variable; without it the
 * screen says which variable to set instead of failing on the first click.
 */
export function PluginPanel({
  plugin,
  onChanged,
}: {
  plugin: PluginConnection;
  onChanged: () => void;
}) {
  const { project, isProjectAdmin } = useProject();
  const { user } = useAuth();
  const [showEdit, setShowEdit] = useState(false);
  const [manifest, setManifest] = useState<PluginManifest | null>(plugin.manifest);
  useEffect(() => setManifest(plugin.manifest), [plugin.manifest]);
  // A new endpoint or secret reference starts the dataset search over.
  const [searchKey, setSearchKey] = useState(() => getPluginConnectionKey(plugin));
  const [success, setSuccess] = useState('');
  const connection = useMutation();
  const canManage = isProjectAdmin || user.isAdmin;
  const canCall = plugin.enabled && plugin.tokenConfigured;
  const outbox = usePluginOutboxSummary(project.id, canManage ? plugin.id : null);
  async function runConnectionOperation(operation: () => Promise<void>) {
    setSuccess('');
    return connection.run(operation);
  }
  return (
    <>
      <div className="section-heading">
        <h2>{plugin.name}</h2>
        {canManage && (
          <div>
            <button
              className="button small"
              disabled={connection.pending || !canCall}
              onClick={() =>
                void runConnectionOperation(async () => {
                  const checked = await administrationApi.checkPlugin(project.id, plugin.id);
                  setManifest(checked);
                  setSuccess(text.checked);
                  onChanged();
                })
              }
            >
              {text.checkPlugin}
            </button>
            <button
              className="button small"
              disabled={connection.pending || !canCall}
              onClick={() =>
                void runConnectionOperation(async () => {
                  const retried = await administrationApi.retryEvents(project.id, plugin.id);
                  setSuccess(`${text.queuedEvents}: ${retried.queued}`);
                  outbox.reload();
                })
              }
            >
              {text.retryEvents}
            </button>
          </div>
        )}
      </div>
      {!plugin.tokenConfigured && (
        <p className="notice warning" role="status">
          {pluginsTextTemplates.pluginTokenMissingNotice(plugin.tokenEnv)}
        </p>
      )}
      <ErrorNotice message={connection.error} />
      {success && (
        <p className="notice success" role="status">
          {success}
        </p>
      )}
      <DetailsList
        entries={[
          [text.baseUrl, plugin.baseUrl],
          [text.tokenEnv, <code>{plugin.tokenEnv}</code>],
          [
            pluginsText.pluginTokenStatus,
            plugin.tokenConfigured
              ? pluginsText.pluginTokenConfigured
              : pluginsText.pluginTokenMissing,
          ],
          [text.pluginVersion, manifest?.version],
          [text.capabilities, manifest?.capabilities.join(', ')],
        ]}
      />
      {user.isAdmin && (
        <div className="section-actions">
          <button
            className="button small"
            onClick={() => setShowEdit(true)}
            disabled={connection.pending}
          >
            {text.editPlugin}
          </button>
          <button
            className="button small"
            disabled={connection.pending}
            data-testid="plugin-toggle"
            onClick={() =>
              void runConnectionOperation(async () => {
                await administrationApi.updatePlugin(project.id, plugin.id, {
                  enabled: !plugin.enabled,
                });
                onChanged();
              })
            }
          >
            {plugin.enabled ? text.disablePlugin : text.enablePlugin}
          </button>
        </div>
      )}
      {canManage && <PluginOutboxStatus summary={outbox} />}
      <details className="plugin-manifest">
        <summary>{text.manifest}</summary>
        {manifest ? (
          <JsonDetails value={manifest} />
        ) : (
          <p className="muted">{text.manifestUnchecked}</p>
        )}
      </details>
      {canManage && canCall && manifest?.capabilities.includes('storage:metrics') && (
        <PluginStorageMetrics pluginId={plugin.id} />
      )}
      {canManage && plugin.tokenConfigured && (
        <PluginDatasetSearch
          key={searchKey}
          projectId={project.id}
          plugin={plugin}
          isChecked={manifest !== null}
          onImported={onChanged}
        />
      )}
      <Link className="button small" to={`/projects/${project.id}/datasets`}>
        {pluginsText.pluginOpenDatasets}
      </Link>
      {user.isAdmin && showEdit && (
        <PluginDialog
          plugin={plugin}
          onClose={() => setShowEdit(false)}
          onSaved={(savedPlugin) => {
            // The saved connection is active before the parent GET finishes.
            if (getPluginConnectionKey(savedPlugin) !== getPluginConnectionKey(plugin)) {
              setManifest(savedPlugin.manifest);
              setSearchKey(getPluginConnectionKey(savedPlugin));
              setSuccess('');
              connection.clearError();
            }
            setShowEdit(false);
            onChanged();
          }}
        />
      )}
    </>
  );
}
