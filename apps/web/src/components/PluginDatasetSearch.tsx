import type { PluginConnection } from '@mmt/contracts';
import { useMadoDatasetSearch } from '../hooks/useMadoDatasetSearch';
import { ResponsiveTable } from './ResponsiveTable';
import { Empty, ErrorNotice } from './Feedback';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { pluginsText } from '../i18n/plugins';

/**
 * The parent remounts on configuration changes, discarding earlier requests and their results.
 */
export function PluginDatasetSearch({
  projectId,
  plugin,
  isChecked,
}: {
  projectId: string;
  plugin: PluginConnection;
  isChecked: boolean;
}) {
  useLocale();
  const search = useMadoDatasetSearch({ projectId, plugin });
  if (!plugin.enabled) return null;
  return (
    <>
      <form
        className="plugin-search"
        onSubmit={(event) => {
          event.preventDefault();
          search.search();
        }}
      >
        <label className="field">
          <span>{text.searchDatasets}</span>
          <input
            value={search.query}
            disabled={!isChecked}
            onChange={(event) => search.setQuery(event.target.value)}
            aria-label={text.searchDatasets}
          />
        </label>
        <button className="button primary" disabled={search.pending || !isChecked}>
          {search.pending ? text.loading : text.search}
        </button>
      </form>
      {!isChecked && <p className="muted">{pluginsText.pluginSearchNeedsCheck}</p>}
      <ErrorNotice message={search.error} />
      {search.imported && (
        <p className="notice success" role="status">
          {`${text.success}: ${search.imported.name} / ${search.imported.version}`}
        </p>
      )}
      {search.datasets &&
        (search.datasets.length ? (
          <ResponsiveTable
            rows={search.datasets}
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
                    disabled={search.pending}
                    onClick={() => search.importDataset(dataset)}
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
