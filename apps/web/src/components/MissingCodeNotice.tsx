import { Link } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import type { MissingCodeReason } from '../lib/codeCandidateReason';
import { useLocale } from '../i18n/useLocale';
import { modelsTextTemplates } from '../i18n/models';
import { text } from '../i18n/catalog';
import { joinSentences } from '../i18n/textJoining';

function describeMissingCode(reason: MissingCodeReason): string {
  if (reason.kind === 'no_code_versions') return text.codeCandidatesNone;
  if (reason.kind === 'no_task_type')
    return modelsTextTemplates.codeCandidatesNoTaskType(text[reason.taskType]);
  if (reason.kind === 'no_common_family')
    return modelsTextTemplates.codeCandidatesNoCommonFamily(reason.families);
  const missing = modelsTextTemplates.codeCandidatesNoFamily(reason.family);
  return reason.caseVariants.length
    ? joinSentences([missing, modelsTextTemplates.codeCandidatesCaseVariant(reason.family, reason.caseVariants)])
    : missing;
}

/** コードバージョンの一覧に候補が無い理由と、作れる場所であるCodeへの案内。 */
export function MissingCodeNotice({ reason }: { reason: MissingCodeReason }) {
  useLocale();
  const { project } = useProject();
  return (
    <p className="field-hint missing-code-notice" role="status">
      {describeMissingCode(reason)} <Link to={`/projects/${project.id}/codes`}>{text.openCodes}</Link>
    </p>
  );
}
