import type { ProjectSettingsSection } from '../lib/projectSettingsSections';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * Links at the top of the long Project settings page to each of its parts, so the archive or the
 * audit log is one tap away instead of several screens of scrolling (on a phone above all).
 */
export function ProjectSettingsContents({ sections }: { sections: ProjectSettingsSection[] }) {
  useLocale();
  return (
    <nav className="settings-contents" aria-label={text.projectSettingsContents}>
      <ul>
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`}>{section.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
