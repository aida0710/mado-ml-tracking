import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useProject } from '../../hooks/useProject';
import { usePluginOutboxSummary } from '../../hooks/usePluginOutboxSummary';
import { useMadoPluginConnection } from '../../hooks/useMadoPluginConnection';
import { DetailsList } from '../../components/JsonDetails';
import { ErrorNotice } from '../../components/Feedback';
import { PluginDatasetSearch } from '../../components/PluginDatasetSearch';
import { PluginOutboxStatus } from '../../components/PluginOutboxStatus';
import { PluginStorageMetrics } from '../../components/PluginStorageMetrics';
import type { PluginSettingsProps } from '../types';
import { MadoSettingsDialog } from './MadoSettingsDialog';
import { useLocale } from '../../i18n/useLocale';
import { pluginsText } from '../../i18n/plugins';
import { text } from '../../i18n/catalog';
import { formatList } from '../../i18n/textJoining';

export function MadoSettings({ plugin, onSaved }: PluginSettingsProps) {
  useLocale();
  const { project, isProjectAdmin } = useProject();
  const { user } = useAuth();
  const [showEdit, setShowEdit] = useState(false);
  const canManage = isProjectAdmin || user.isAdmin;
  const ready = plugin?.configurationStatus === 'ready';
  const canCheck = !!plugin?.config && plugin.credentialsConfigured.readToken && plugin.secretStorageAvailable;
  const canCall = ready && plugin.enabled && plugin.tokenConfigured;
  const outbox = usePluginOutboxSummary(project.id, canManage ? plugin?.id ?? null : null);
  const connection = useMadoPluginConnection({ projectId: project.id, plugin, onSaved, onRetried: outbox.reload });
  return <>
    <div className="section-heading">
      <h2>{plugin?.name ?? 'Mado'}</h2>
      <span className="report-badge">{plugin?.enabled ? text.enabled : text.disabled}</span>
    </div>
    {!plugin && <p className="notice">{user.isAdmin ? pluginsText.madoNotConfigured : pluginsText.madoAskAdmin}</p>}
    {plugin?.configurationStatus === 'migration_pending' && <p className="notice warning">{pluginsText.madoMigrationPending}</p>}
    {ready && !plugin.tokenConfigured && <p className="notice warning">{pluginsText.madoCredentialsMissing}</p>}
    {plugin?.secretStorageAvailable === false && <p className="notice warning">{pluginsText.secretStorageUnavailable}</p>}
    {plugin?.config && <DetailsList entries={[
      [pluginsText.madoApiUrl, plugin.config.apiUrl],
      [pluginsText.madoWebUrl, plugin.config.webUrl],
      [pluginsText.madoLineageUrl, plugin.config.lineageUrl],
      [pluginsText.madoNamespaces, formatList(plugin.config.namespaces)],
      [pluginsText.madoReadToken, plugin.credentialsConfigured.readToken ? pluginsText.credentialConfigured : pluginsText.credentialMissing],
      [pluginsText.madoLineageToken, plugin.credentialsConfigured.lineageToken ? pluginsText.credentialConfigured : pluginsText.credentialMissing],
      [pluginsText.madoMetricsToken, plugin.credentialsConfigured.metricsToken ? pluginsText.credentialConfigured : pluginsText.credentialMissing],
    ]} />}
    <div className="section-actions mado-settings-actions">
      {user.isAdmin && <>
        <button className="button small" onClick={() => setShowEdit(true)} disabled={connection.pending}>
          {pluginsText.madoSettings}
        </button>
        {plugin && <button className="button small" data-testid="plugin-toggle" onClick={connection.toggle}
          disabled={connection.pending || (!plugin.enabled && !(ready && plugin.tokenConfigured))}>
          {plugin.enabled ? pluginsText.disableIntegration : pluginsText.enableIntegration}
        </button>}
        {plugin?.configurationStatus === 'migration_pending' && plugin.config && <button
          className="button small" onClick={connection.completeMigration}
          disabled={connection.pending || !plugin.tokenConfigured || !connection.checked}>
          {pluginsText.completeMigration}
        </button>}
      </>}
      {canManage && plugin && <>
        <button className="button small" onClick={connection.check} disabled={connection.pending || !canCheck}>
          {text.checkPlugin}
        </button>
        <button className="button small" onClick={connection.retry} disabled={connection.pending || !canCall}>
          {text.retryEvents}
        </button>
      </>}
    </div>
    {plugin && <p className="muted">{pluginsText.madoCheckHint}</p>}
    <ErrorNotice message={connection.error} />
    {connection.success && <p className="notice success" role="status">
      {connection.success.kind === 'checked' ? text.checked : `${text.queuedEvents}: ${connection.success.count}`}
    </p>}
    {canManage && plugin && <PluginOutboxStatus summary={outbox} />}
    {canManage && canCall && connection.checked && plugin.credentialsConfigured.metricsToken &&
      <PluginStorageMetrics pluginId={plugin.id} />}
    {canManage && canCall && <PluginDatasetSearch
      projectId={project.id} plugin={plugin} isChecked={connection.checked}
    />}
    <Link className="button small" to={`/projects/${project.id}/datasets`}>{pluginsText.pluginOpenDatasets}</Link>
    {user.isAdmin && showEdit && <MadoSettingsDialog plugin={plugin} onClose={() => setShowEdit(false)}
      onSaved={(saved) => { setShowEdit(false); onSaved(saved); }} />}
  </>;
}
