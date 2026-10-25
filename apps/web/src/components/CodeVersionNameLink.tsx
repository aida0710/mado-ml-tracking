import { Link } from 'react-router-dom';
import { registryApi } from '../api/registry';
import { useQuery } from '../hooks/useQuery';
import { formatCodeVersionName } from '../lib/catalogOptions';

/**
 * A link to a code version by "code name / version", loaded on its own (as RunNameLink does for a
 * Run); the id stays until the name arrives, or if it cannot.
 */
export function CodeVersionNameLink({
  projectId,
  codeVersionId,
}: {
  projectId: string;
  codeVersionId: string;
}) {
  const detail = useQuery({ key: `${projectId}:code-version:${codeVersionId}`, load: (signal) =>
    registryApi.codeVersionDetail(projectId, codeVersionId, signal),
  });
  const codes = `/projects/${projectId}/codes`;
  return detail.value ? (
    <Link
      className="mono"
      title={codeVersionId}
      to={`${codes}?${new URLSearchParams({ id: detail.value.code.id, version: codeVersionId })}`}
    >
      {formatCodeVersionName(detail.value.code.name, detail.value.version.version)}
    </Link>
  ) : (
    <Link className="mono" to={`${codes}?${new URLSearchParams({ version: codeVersionId })}`}>
      {codeVersionId}
    </Link>
  );
}
