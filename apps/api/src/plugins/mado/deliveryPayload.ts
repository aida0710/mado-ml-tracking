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
  // 文字列そのものを残せば、JSONBのキーの並べ替えや認証情報の更新があっても配信のハッシュが
  // 変わらない。
  const payload = JSON.stringify(createOpenLineageEvent(event, { config, pluginId }));
  return { payload, payloadHash: createHash('sha256').update(payload).digest('hex') };
}
