import type { ProjectSettingsSection } from '../lib/projectSettingsSections';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 長いProjectの設定のページの先頭に置く、各部分へのリンク。アーカイブや監査ログへ、何画面もの
 * スクロールでなく1回のタップで行けるようにする（とくにスマートフォンで）。
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
