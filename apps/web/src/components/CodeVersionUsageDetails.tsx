import { useLocale } from '../i18n/useLocale';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { CodeVersion } from '@mmt/contracts';
import { useCodeVersionUsage } from '../hooks/useCodeVersionUsage';
import { DetailsList } from './JsonDetails';
import { ErrorNotice } from './Feedback';
import { text } from '../i18n/catalog';
import { modelsText } from '../i18n/models';

/** On the Code page: which models a code version can run, and which Tasks and rules use it. */
export function CodeVersionUsageDetails({
  projectId,
  version,
}: {
  projectId: string;
  version: CodeVersion;
}) {
  useLocale();
  const { usage, loading, error, reload } = useCodeVersionUsage(projectId, version);
  const base = `/projects/${projectId}`;
  const listOrNone = (items: ReactNode[], none: string) =>
    items.length ? <span className="inline-links">{items}</span> : none;
  return (
    <section aria-label={modelsText.codeUsage}>
      <h3>{modelsText.codeUsage}</h3>
      <ErrorNotice message={error} retry={reload} />
      {loading && !usage && <p className="muted">{text.loading}</p>}
      {usage && (
        <DetailsList
          entries={[
            [
              modelsText.codeUsageModels,
              listOrNone(
                usage.models.map((model) => (
                  <Link key={model.id} to={`${base}/models?id=${model.id}`}>
                    {model.name}
                  </Link>
                )),
                modelsText.codeUsageNoModels,
              ),
            ],
            [
              modelsText.codeUsageTasks,
              listOrNone(
                usage.tasks.map((task) => (
                  <Link key={task.id} to={`${base}/tasks?id=${task.id}`}>
                    {task.name}
                  </Link>
                )),
                text.none,
              ),
            ],
            [
              modelsText.codeUsageRules,
              listOrNone(
                usage.rules.map((rule) => <span key={rule.id}>{rule.name}</span>),
                text.none,
              ),
            ],
          ]}
        />
      )}
    </section>
  );
}
