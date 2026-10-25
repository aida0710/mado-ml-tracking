import { useId } from 'react';
import type { ProjectRole } from '@mmt/contracts';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

// 弱い順。Roleを読むときの順に合わせる。
const PROJECT_ROLES: readonly ProjectRole[] = ['viewer', 'editor', 'admin'];

/** ProjectのRoleの選択欄の<option>。弱い順に並べる。 */
export function ProjectRoleOptions() {
  useLocale();
  return PROJECT_ROLES.map((role) => (
    <option key={role} value={role}>
      {text[role]}
    </option>
  ));
}

export function ProjectRoleSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ProjectRole;
  onChange: (role: ProjectRole) => void;
}) {
  useLocale();
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as ProjectRole)}
      >
        <ProjectRoleOptions />
      </select>
    </div>
  );
}
