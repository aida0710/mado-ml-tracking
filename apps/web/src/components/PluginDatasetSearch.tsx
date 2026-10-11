import { useState } from 'react';
import type { PluginConnection, PluginDataset } from '@mmt/contracts';
import { administrationApi } from '../api/administration';
import { useMutation } from '../hooks/useMutation';
import { ResponsiveTable } from './ResponsiveTable';
import { Empty, ErrorNotice } from './Feedback';
import { text } from '../i18n/catalog';
import { pluginsText } from '../i18n/plugins';

/**
 * Searches a plugin's datasets and imports a version into the Project. Searching waits for a
 * successful connection check (`isChecked`): until then the plugin may not even be reachable.
 * The parent remounts this per connection, so results of an older URL or token never show.
 */
export function PluginDatasetSearch({
  projectId,
  plugin,
  isChecked,
  onImported,
}: {
  projectId: string;
  plugin: PluginConnection;
  isChecked: boolean;
  onImported: () => void;
}) {
  const [query, setQuery] = useState('');
  const [datasets, setDatasets] = useState<PluginDataset[] | null>(null);
  const [success, setSuccess] = useState('');
  const mutation = useMutation();
  // Hidden while the plugin is disabled; the results come back when it is enabled again.
  if (!plugin.enabled) return null;
  return (
    <>
      <form
        className="plugin-search"
        onSubmit={(event) => {
          event.preventDefault();
          setSuccess('');
          setDatasets(null);
          void mutation.run(async () => {
            setDatasets(await administrationApi.searchDatasets(projectId, plugin.id, query));
          });
        }}
      >
        <label className="field">
          <span>{text.searchDatasets}</span>
          <input
            value={query}
            disabled={!isChecked}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={text.searchDatasets}
          />
        </label>
        <button className="button primary" disabled={mutation.pending || !isChecked}>
          {mutation.pending ? text.loading : text.search}
        </button>
      </form>
      {!isChecked && <p className="muted">{pluginsText.pluginSearchNeedsCheck}</p>}
      <ErrorNotice message={mutation.error} />
      {success && (
        <p className="notice success" role="status">
          {success}
        </p>
      )}
      {datasets &&
        (datasets.length ? (
          <ResponsiveTable
            rows={datasets}
            rowKey={(dataset) => `${dataset.externalId}:${dataset.version}`}
            columns={[
              {
                key: 'name',
                priority: 'primary',
                header: text.name,
                render: (dataset) => `${dataset.namespace}/${dataset.name}`,
              },
              {
                key: 'version',
                priority: 'primary',
                header: text.version,
                className: 'mono',
                render: (dataset) => dataset.version,
              },
              {
                key: 'uri',
                priority: 'secondary',
                header: text.uri,
                className: 'mono long-value',
                render: (dataset) => dataset.uri,
              },
              {
                key: 'digest',
                priority: 'secondary',
                header: text.digest,
                className: 'mono long-value',
                render: (dataset) => dataset.digest,
              },
              {
                key: 'import',
                priority: 'secondary',
                header: text.importing,
                render: (dataset) => (
                  <button
                    className="button small"
                    disabled={mutation.pending}
                    onClick={() =>
                      void mutation
                        .run(() => administrationApi.importDataset(projectId, plugin.id, dataset))
                        .then((imported) => {
                          if (!imported) return;
                          setSuccess(`${text.success}: ${imported.name} / ${imported.version}`);
                          onImported();
                        })
                    }
                  >
                    {text.importDataset}
                  </button>
                ),
              },
            ]}
          />
        ) : (
          <Empty>{text.noResults}</Empty>
        ))}
    </>
  );
}
