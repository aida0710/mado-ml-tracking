import { useLocale } from '../i18n/useLocale';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { readSettingsReturnScreen } from '../lib/settingsReturnScreen';
import { settingsShellTextTemplates } from '../i18n/settingsShell';

/**
 * Above every 全体設定 screen: back to the Project screen 全体設定 was opened from (the Jobs a
 * user was on, not only the Project's start page the app name leads to). Hidden when 全体設定 was
 * opened directly.
 */
export function SettingsReturnLink() {
  useLocale();
  // Read once: moving between 全体設定 sections keeps the same way back.
  const [screen] = useState(readSettingsReturnScreen);
  if (!screen) return null;
  return (
    <Link className="settings-return-link" to={screen.path}>
      <ArrowLeft size={15} aria-hidden="true" />
      {settingsShellTextTemplates.settingsReturnToProject(screen.projectName)}
    </Link>
  );
}
