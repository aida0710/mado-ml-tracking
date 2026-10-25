import type { ReactNode } from 'react';
import { PageHeader } from './PageHeader';
import {
  isAdminSection,
  SETTINGS_SECTION_LABELS,
  type SettingsSection,
} from '../layout/settingsSections';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 全体設定の画面の見出し。画面の名前と、その上に属するサイドバーのグループ（「全体設定」か
 * 「全体管理」）、そして操作を置く。アカウントの区分の中のパスワードの変更のように、区分の中の
 * ページは自分のタイトルを渡す。
 */
export function SettingsPageHeader({
  section,
  title = SETTINGS_SECTION_LABELS[section],
  actions,
}: {
  section: SettingsSection;
  title?: string;
  actions?: ReactNode;
}) {
  useLocale();
  return (
    <PageHeader
      eyebrow={isAdminSection(section) ? text.administration : text.globalSettings}
      title={title}
      actions={actions}
    />
  );
}
