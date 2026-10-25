import type { PluginOutboxSummary } from '@mmt/contracts';
import type { QueryState } from '../hooks/useQuery';
import { formatDate } from '../lib/format';
import { DetailsList } from './JsonDetails';
import { Resource } from './Feedback';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/** 届いていないプラグインのイベント。件数、最も古いもの、最新の失敗のコード。 */
export function PluginOutboxStatus({ summary }: { summary: QueryState<PluginOutboxSummary> }) {
  useLocale();
  return (
    <section className="plugin-outbox" data-testid="plugin-outbox">
      <h3>{text.pluginOutbox}</h3>
      <Resource query={summary}>
        {(outbox) => (
          <>
            {outbox.stalled && (
              <p className="notice error" role="status">
                {text.pluginOutboxStalled}
              </p>
            )}
            <DetailsList
              entries={[
                [text.pluginOutboxPending, outbox.pending],
                [text.pluginOutboxSending, outbox.sending],
                [text.pluginOutboxOldestPending, formatDate(outbox.oldestPendingAt)],
                [text.pluginOutboxMaxAttempts, outbox.maxAttempts],
                [text.pluginOutboxLastError, outbox.lastError && <code>{outbox.lastError}</code>],
                [text.pluginOutboxLastDelivered, formatDate(outbox.lastDeliveredAt)],
              ]}
            />
          </>
        )}
      </Resource>
    </section>
  );
}
