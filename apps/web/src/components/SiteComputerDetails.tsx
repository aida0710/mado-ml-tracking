import type { ComputeTargetDetails, User } from '@mmt/contracts';
import { CopyableValue } from './CopyableValue';
import { ManualSubmissionGuide } from './ManualSubmissionNotice';
import { SiteJobShellPanel } from './SiteJobShellPanel';
import { SitePersonalSettingsPanel } from './SitePersonalSettingsPanel';
import { SitePersonalSettingsTable } from './SitePersonalSettingsTable';
import { SiteSharedKeyPanel } from './SiteSharedKeyPanel';
import { manualSiteOwnership } from '../lib/manualSubmission';
import { canManageTarget } from '../lib/permissions';
import { personalSettingsScope } from '../lib/sitePersonalSettingsInput';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 全体設定 → コンピュータの下に出すsiteの詳細。使える人はだれでも、job shellを読み、自分の設定
 * （ランチャーが各人としてログインするなら鍵も）を保ち、手動のsiteなら投入のしかたを見られる。
 * 所有者と全体管理者は、job shellのバージョンの保存、共有アカウントの鍵の登録、全員の設定の確認も
 * できる。
 */
export function SiteComputerDetails({
  target,
  user,
  onTargetChanged,
}: {
  target: ComputeTargetDetails;
  user: Pick<User, 'id' | 'isAdmin'>;
  onTargetChanged: () => void;
}) {
  useLocale();
  const canManage = canManageTarget(user, target);
  const isAutomatic = target.submissionMode === 'automatic';
  return (
    <section className="settings-section site-computer" data-testid="site-computer-details">
      <div className="section-heading">
        <h2>{target.name}</h2>
      </div>
      <CopyableValue label={text.computerId} value={target.id} />
      {!isAutomatic && (
        <ManualSubmissionGuide targetId={target.id} ownership={manualSiteOwnership(target, user)} />
      )}
      <SiteJobShellPanel targetId={target.id} canEdit={canManage} onSaved={onTargetChanged} />
      {isAutomatic && canManage && target.siteAccountMode === 'shared' && (
        <SiteSharedKeyPanel target={target} userId={user.id} />
      )}
      <SitePersonalSettingsPanel target={target} userId={user.id} />
      {canManage && personalSettingsScope(target) !== 'none' && (
        <SitePersonalSettingsTable targetId={target.id} />
      )}
    </section>
  );
}
