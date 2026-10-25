import { randomUUID } from 'node:crypto';
import type { PluginEvent, Run } from '@mmt/contracts';
import { rows, type Connection } from '../db/database.js';
import { findDatasetVersions } from '../repositories/registryRepository.js';
import type { PluginConnectionRecord } from '../plugins/pluginConnection.js';
import { prepareMadoDelivery } from '../plugins/mado/deliveryPayload.js';

export async function enqueueRunEvent(connection: Connection, run: Run): Promise<void> {
  if (run.status === 'queued') return;
  // コードの本文とCodeVersionの環境は実行のAPIのためのもので、外部のlineageの利用者には渡さない。
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
  // 取り込みと同じく接続を共有ロックし、編集でこの遷移の配信先が変わらないようにする。
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
