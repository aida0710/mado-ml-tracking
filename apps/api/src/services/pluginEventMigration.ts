import type { PluginEvent } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import { conflict, notFound } from '../domain/errors.js';
import type { PluginConnectionRecord } from '../plugins/pluginConnection.js';
import { prepareMadoDelivery } from '../plugins/mado/deliveryPayload.js';
import { PLUGIN_DELIVERY_LEASE_SECONDS } from '../plugins/deliveryPolicy.js';

export async function pinLegacyPluginEvents(
  connection: Connection,
  plugin: PluginConnectionRecord,
): Promise<void> {
  if (!plugin.config) return;
  const events = await rows<{ id: string; event: PluginEvent }>(
    connection,
    'SELECT id,event FROM plugin_outbox WHERE plugin_id=$1 AND payload IS NULL FOR UPDATE',
    [plugin.id],
  );
  for (const event of events) {
    // Legacy bridges used every external identity; retain that exact payload for ledger matching.
    const delivery = prepareMadoDelivery({ event: event.event, config: plugin.config });
    await connection.query(
      'UPDATE plugin_outbox SET payload=$2,payload_hash=$3,config_revision=$4,destination_url=$5 WHERE id=$1',
      [
        event.id,
        delivery.payload,
        delivery.payloadHash,
        plugin.configRevision,
        plugin.config.lineageUrl,
      ],
    );
  }
}

export async function importPluginDeliveryReceipts(
  connection: Connection,
  request: {
    pluginId: string;
    receipts: { eventId: string; payloadHash: string }[];
  },
): Promise<{ imported: number }> {
  let imported = 0;
  for (const receipt of request.receipts) {
    const delivery = await first<{
      id: string;
      payloadHash: string | null;
      status: string;
      leaseExpired: boolean;
    }>(
      connection,
      `SELECT id,payload_hash,status,COALESCE(locked_at<now()-make_interval(secs=>$3),false) AS lease_expired
       FROM plugin_outbox WHERE plugin_id=$1 AND event_id=$2 FOR UPDATE`,
      [request.pluginId, receipt.eventId, PLUGIN_DELIVERY_LEASE_SECONDS],
    );
    if (!delivery) notFound('送信記録');
    if (delivery.payloadHash !== receipt.payloadHash)
      conflict('旧サービスの送信記録とイベントの内容が一致しません');
    if (delivery.status === 'sending' && !delivery.leaseExpired)
      conflict('送信中のイベントは移行できません。連携を無効化し、送信の完了を待ってください');
    if (delivery.status === 'delivered') continue;
    await connection.query(
      "UPDATE plugin_outbox SET status='delivered',delivered_at=now(),last_error=NULL,locked_at=NULL,delivery_id=NULL WHERE id=$1",
      [delivery.id],
    );
    imported++;
  }
  return { imported };
}
