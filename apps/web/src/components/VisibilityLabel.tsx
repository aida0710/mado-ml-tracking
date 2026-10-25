import type { ComputeTargetVisibility, ProjectVisibility } from '@mmt/contracts';
import { Lock } from 'lucide-react';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * ProjectやコンピュータのPublic・Privateの表示。Privateには鍵が付く。`iconOnly`は鍵だけを残し
 * （Publicなら何も出さない）、名前はスクリーンリーダーとツールチップに任せる。Projectの
 * 切り替えメニューのような詰まった行で使う。
 */
export function VisibilityLabel({
  visibility,
  iconOnly = false,
}: {
  visibility: ProjectVisibility | ComputeTargetVisibility;
  iconOnly?: boolean;
}) {
  useLocale();
  const name = text[visibility];
  return (
    <span className="visibility-label" title={iconOnly ? name : undefined}>
      {visibility === 'private' && <Lock size={12} aria-hidden="true" />}
      <span className={iconOnly ? 'sr-only' : undefined}>{name}</span>
    </span>
  );
}
