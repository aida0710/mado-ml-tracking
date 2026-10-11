import { useLocale } from '../i18n/useLocale';
import { Link } from 'react-router-dom';
import { useFamilyCodeVersions } from '../hooks/useFamilyCodeVersions';
import { formatCodeVersionName } from '../lib/catalogOptions';
import { ErrorNotice } from './Feedback';
import { modelsText, modelsTextTemplates } from '../i18n/models';
import { text } from '../i18n/catalog';

/**
 * On the Models page: the code versions that list the model's family, so which code can run the
 * model is visible before a Task or a rule has to offer it.
 */
export function FamilyCodeVersions({ projectId, family }: { projectId: string; family: string }) {
  useLocale();
  const { items, error, reload } = useFamilyCodeVersions(projectId, family);
  const codes = `/projects/${projectId}/codes`;
  return (
    <section aria-label={modelsText.familyCodeVersions}>
      <h3>{modelsText.familyCodeVersions}</h3>
      <ErrorNotice message={error} retry={reload} />
      {!items ? (
        !error && <p className="muted">{text.loading}</p>
      ) : items.length ? (
        <p className="inline-links">
          {items.map(({ code, version }) => (
            <Link
              key={version.id}
              className="mono"
              to={`${codes}?${new URLSearchParams({ id: code.id, version: version.id })}`}
            >
              {formatCodeVersionName(code.name, version.version)}
            </Link>
          ))}
        </p>
      ) : (
        <p className="muted">
          {modelsTextTemplates.familyCodeVersionsNone(family)}{' '}
          <Link to={codes}>{text.openCodes}</Link>
        </p>
      )}
    </section>
  );
}
