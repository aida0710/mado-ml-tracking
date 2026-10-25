import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { readSettingsReturnScreen } from '../lib/settingsReturnScreen';
import { useLocale } from '../i18n/useLocale';
import { settingsShellTextTemplates } from '../i18n/settingsShell';

/**
 * 全体設定のどの画面にも上に出す、全体設定を開く前のProjectの画面へ戻るリンク（アプリ名から
 * 行けるProjectの最初の画面に限らず、利用者が見ていたJobsなどへ戻る）。全体設定を直接開いた
 * ときは出さない。
 */
export function SettingsReturnLink() {
  useLocale();
  // 1回だけ読む。全体設定の中で画面を移っても、戻り先は変わらない。
  const [screen] = useState(readSettingsReturnScreen);
  if (!screen) return null;
  return (
    <Link className="settings-return-link" to={screen.path}>
      <ArrowLeft size={15} aria-hidden="true" />
      {settingsShellTextTemplates.settingsReturnToProject(screen.projectName)}
    </Link>
  );
}
