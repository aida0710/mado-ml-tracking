import { Link } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import type { MissingCodeReason } from '../lib/codeCandidateReason';
import { modelsTextTemplates } from '../i18n/models';
import { text } from '../i18n/catalog';

function describeMissingCode(reason: MissingCodeReason): string {
  if (reason.kind === 'no_code_versions') return text.codeCandidatesNone;
  if (reason.kind === 'no_task_type')
    return modelsTextTemplates.codeCandidatesNoTaskType(text[reason.taskType]);
  const missing = modelsTextTemplates.codeCandidatesNoFamily(reason.family);
  return reason.caseVariants.length
    ? `${missing}${modelsTextTemplates.codeCandidatesCaseVariant(reason.family, reason.caseVariants)}`
    : missing;
}

/** Why a code version list offers nothing, with the way to Code where one can be made. */
export function MissingCodeNotice({ reason }: { reason: MissingCodeReason }) {
  const { project } = useProject();
  return (
    <p className="field-hint missing-code-notice" role="status">
      {describeMissingCode(reason)} <Link to={`/projects/${project.id}/codes`}>{text.openCodes}</Link>
    </p>
  );
}
