import { createHash } from 'node:crypto';
import type { MadoPluginConfig, PluginEvent } from '@mmt/contracts';
import { createOpenLineageEvent } from './openLineageEvent.js';

export function prepareMadoDelivery({
  event,
  config,
  pluginId,
}: {
  event: PluginEvent;
  config: MadoPluginConfig;
  pluginId?: string;
}) {
  // The exact text survives JSONB key reordering and credential rotations, preserving the delivery hash.
  const payload = JSON.stringify(createOpenLineageEvent(event, { config, pluginId }));
  return { payload, payloadHash: createHash('sha256').update(payload).digest('hex') };
}
