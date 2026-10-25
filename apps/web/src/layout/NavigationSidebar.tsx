import type { ReactNode } from 'react';
import { NavigationSidebar as DesignSystemNavigationSidebar } from '@mado/design-system/react';
import type { Navigation } from '../hooks/useNavigation';
import { NavigationLinkList } from './NavigationLinkList';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 900px以上のナビゲーション（デザインシステムのNavigationSidebar）。名前の付いたサイドバーの上端に
 * `header`（プロジェクトの選択欄）を置く。アイコンだけのレールでは名前をツールチップで出す。
 */
export function NavigationSidebar({ navigation, header }: { navigation: Navigation; header?: ReactNode }) {
  useLocale();
  return (
    <DesignSystemNavigationSidebar
      layout={navigation.layout}
      labels={{
        // 同じ画面のもう1つの<aside>（Experimentsの一覧）と見分ける名前。
        sidebar: text.navigationSidebar,
        expand: text.expandNavigation,
        collapse: text.collapseNavigation,
        width: text.resizeNavigation,
      }}
      header={header}
      renderLinks={({ showsTitles }) =>
        navigation.groups.length > 0 && <NavigationLinkList groups={navigation.groups} showsTitles={showsTitles} />
      }
    />
  );
}
