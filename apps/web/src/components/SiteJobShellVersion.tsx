import { siteComputersApi } from '../api/siteComputers';
import { useQuery } from '../hooks/useQuery';
import { Resource } from './Feedback';
import { formatDate } from '../lib/format';
import { useLocale } from '../i18n/useLocale';
import { siteComputersTextTemplates } from '../i18n/siteComputers';

/**
 * siteのJobが投入されたときのjob shellのバージョンと、読むためのスクリプトそのもの。バージョンは
 * 変わらないので、siteのjob shellが編集された後でも、実際に動いたものをそのまま示す。
 */
export function SiteJobShellVersion({ targetId, jobShellId }: { targetId: string; jobShellId: string }) {
  useLocale();
  const shell = useQuery({ key: `site-job-shell:${jobShellId}`, load: (signal) =>
    siteComputersApi.jobShell(targetId, jobShellId, signal),
  });
  return (
    <Resource query={shell}>
      {(value) => (
        <details>
          <summary>
            <span className="mono">{siteComputersTextTemplates.jobShellVersionLabel(value.version)}</span>
            {` · ${formatDate(value.createdAt)}`}
          </summary>
          <pre className="json-view job-shell-content">{value.content}</pre>
        </details>
      )}
    </Resource>
  );
}
