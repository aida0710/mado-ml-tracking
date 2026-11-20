import { RefreshCw } from 'lucide-react';
import { dataCatalogPluginApi } from '../../api/dataCatalogPlugin';
import { useQuery } from '../../hooks/useQuery';
import { Resource } from '../Feedback';
import { SettingsPageHeader } from '../SettingsPageHeader';
import { DataCatalogPluginSection } from './DataCatalogPluginSection';
import { useLocale } from '../../i18n/useLocale';
import { pluginsText } from '../../i18n/plugins';
import { text } from '../../i18n/catalog';

/** 全体管理の「Plugins」。ほかのサービスとの接続を、全体で1つずつ持つ。 */
export function PluginsPanel() {
  useLocale();
  const dataCatalog = useQuery({
    key: 'admin:plugins:data-catalog',
    load: (signal) => dataCatalogPluginApi.get(signal),
  });
  return (
    <section className="admin-plugins">
      <SettingsPageHeader
        section="plugins"
        actions={
          <button className="icon-button" aria-label={text.refresh} onClick={dataCatalog.reload}>
            <RefreshCw size={17} />
          </button>
        }
      />
      <p className="muted">{pluginsText.pluginsAbout}</p>
      <Resource query={dataCatalog}>
        {(plugin) => <DataCatalogPluginSection plugin={plugin} onChanged={dataCatalog.reload} />}
      </Resource>
    </section>
  );
}
