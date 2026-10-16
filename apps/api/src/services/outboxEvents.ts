import { randomUUID } from 'node:crypto';
import type { PluginEvent, Run } from '@mmt/contracts';
import { rows, type Connection } from '../db/database.js';
import { findDatasetVersions } from '../repositories/registryRepository.js';
import type { PluginConnectionRecord } from '../plugins/pluginConnection.js';
import { prepareMadoDelivery } from '../plugins/mado/deliveryPayload.js';

export async function enqueueRunEvent(connection: Connection, run: Run): Promise<void> {
  if (run.status === 'queued') return;
  // Code text and CodeVersion environment belong to the execution API, not external lineage consumers.
  const { executionSnapshot: _executionSnapshot, ...eventRun } = run;
  const event: PluginEvent = {
    id: randomUUID(),
    type: run.status === 'running' ? 'run.started' : `run.${run.status}`,
    timestamp: run.endedAt ?? run.startedAt ?? new Date().toISOString(),
    projectId: run.projectId,
    run: eventRun,
    inputDatasets: await findDatasetVersions(connection, {
      projectId: run.projectId,
      ids: run.inputDatasetVersionIds,
    }),
    outputDatasets: await findDatasetVersions(connection, {
      projectId: run.projectId,
      ids: run.outputDatasetVersionIds,
    }),
  };
  // Share the connection lock with imports: edits cannot redirect this transition's delivery.
  const plugins = await rows<PluginConnectionRecord>(
    connection,
    `SELECT * FROM plugin_connections WHERE project_id=$1 AND enabled
      AND encrypted_credentials IS NOT NULL
      AND credentials_configured->>'accessToken'='true' FOR SHARE`,
    [run.projectId],
  );
  for (const plugin of plugins) {
    const delivery = prepareMadoDelivery({ event, config: plugin.config, pluginId: plugin.id });
    await connection.query(
      `INSERT INTO plugin_outbox(plugin_id,event_id,event,payload,payload_hash,config_revision,destination_url)
       VALUES($1,$2,$3::jsonb,$4,$5,$6,$7)`,
      [
        plugin.id,
        event.id,
        JSON.stringify(event),
        delivery.payload,
        delivery.payloadHash,
        plugin.configRevision,
        plugin.config.lineageUrl,
      ],
    );
  }
}
