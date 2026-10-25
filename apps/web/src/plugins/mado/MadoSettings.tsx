import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MADO_SCOPES } from '@mmt/contracts';
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
import {
  formatMadoTokenExpiry, formatMadoTokenNamespaces, formatMadoTokenPermissions,
} from './madoAccessTokenGrantText';
import { useLocale } from '../../i18n/useLocale';
import { pluginsText } from '../../i18n/plugins';
import { text } from '../../i18n/catalog';

export function MadoSettings({ plugin, onSaved }: PluginSettingsProps) {
  useLocale();
  const { project, isProjectAdmin } = useProject();
  const { user } = useAuth();
  const [showEdit, setShowEdit] = useState(false);
  const canManage = isProjectAdmin || user.isAdmin;
  const ready = plugin !== null;
  const canCheck = !!plugin?.config && plugin.credentialsConfigured.accessToken && plugin.secretStorageAvailable;
  const canCall = ready && plugin.enabled && plugin.tokenConfigured;
  const grant = plugin?.accessTokenGrant ?? null;
  const canReadCapacity = grant?.scopes.includes(MADO_SCOPES.metricsRead) ?? false;
  const outbox = usePluginOutboxSummary(project.id, canManage ? plugin?.id ?? null : null);
  const connection = useMadoPluginConnection({ projectId: project.id, plugin, onSaved, onRetried: outbox.reload });
  return <>
    <div className="section-heading">
      <h2>{plugin?.name ?? 'Mado'}</h2>
      <span className="status-badge status-accent">{plugin?.enabled ? text.enabled : text.disabled}</span>
    </div>
    {!plugin && <p className="notice">{user.isAdmin ? pluginsText.madoNotConfigured : pluginsText.madoAskAdmin}</p>}
    {ready && !plugin.tokenConfigured && <p className="notice warning">{pluginsText.madoCredentialsMissing}</p>}
    {plugin?.secretStorageAvailable === false && <p className="notice warning">{pluginsText.secretStorageUnavailable}</p>}
    {plugin?.config && <DetailsList entries={[
      [pluginsText.madoApiUrl, plugin.config.apiUrl],
      [pluginsText.madoWebUrl, plugin.config.webUrl],
      [pluginsText.madoLineageUrl, plugin.config.lineageUrl],
      [pluginsText.madoJobNamespace, plugin.config.jobNamespace],
      [pluginsText.madoAccessToken, plugin.credentialsConfigured.accessToken ? pluginsText.credentialConfigured : pluginsText.credentialMissing],
      [pluginsText.madoTokenPermissions, grant ? formatMadoTokenPermissions(grant) : pluginsText.madoGrantNotChecked],
      [pluginsText.madoNamespaces, grant ? formatMadoTokenNamespaces(grant) : pluginsText.madoGrantNotChecked],
      [pluginsText.madoTokenExpiresAt, grant ? formatMadoTokenExpiry(grant) : pluginsText.madoGrantNotChecked],
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
    {canManage && canCall && connection.checked && canReadCapacity &&
      <PluginStorageMetrics pluginId={plugin.id} />}
    {canManage && canCall && <PluginDatasetSearch
      projectId={project.id} plugin={plugin} isChecked={connection.checked}
    />}
    <Link className="button small" to={`/projects/${project.id}/datasets`}>{pluginsText.pluginOpenDatasets}</Link>
    {user.isAdmin && showEdit && <MadoSettingsDialog plugin={plugin} onClose={() => setShowEdit(false)}
      onSaved={(saved) => { setShowEdit(false); onSaved(saved); }} />}
  </>;
}
