import type {
  ComputeTargetDetails,
  SitePersonalSettings,
  SitePersonalSettingsInput,
} from '@mmt/contracts';
import type { FormValues } from '../types/form';
import { getFieldValue } from './formValues';
import { parseAccountName, parseSiteDirectory } from './siteSettingsInput';
import { formatSiteVariables, parseSiteVariables } from './siteVariables';
import { text } from '../i18n/catalog';

/**
 * 利用者がsiteで自分のために設定するもの。ランチャーが依頼した人ごとにその人のアカウントで
 * ログインするsite（'withAccount'）では、本人がアカウント名を入れ、ランチャーがそのアカウントの
 * 鍵を作る。手動投入のsite（'withoutAccount'）では、`mado-tracking submit`を実行した人が
 * 本人として投入するので、残るのは作業ディレクトリと変数だけ。共用アカウント（'none'）は全員の
 * Jobを同じように動かすので、APIはそこでの個人設定を拒否する（site_settings_invalid）。
 */
export type PersonalSettingsScope = 'withAccount' | 'withoutAccount' | 'none';

export function personalSettingsScope(
  target: Pick<ComputeTargetDetails, 'submissionMode' | 'siteAccountMode'>,
): PersonalSettingsScope {
  if (target.submissionMode === 'manual') return 'withoutAccount';
  return target.siteAccountMode === 'personal' ? 'withAccount' : 'none';
}

export function personalSettingsFormValues(item: SitePersonalSettings | null): FormValues {
  return {
    accountName: item?.accountName ?? '',
    personalWorkDirectory: item?.workDirectory ?? '',
    personalVariables: formatSiteVariables(item?.variables ?? {}),
  };
}

/**
 * PUT .../personal-settings/meが受け取る形の自分の設定。アカウント名は、ランチャーが各人の
 * アカウントでログインするsiteでだけ送り、そこでは必須。作業ディレクトリが空なら、siteの
 * 作業ディレクトリを使う。
 */
export function buildPersonalSettingsInput(
  values: FormValues,
  scope: Exclude<PersonalSettingsScope, 'none'>,
): SitePersonalSettingsInput {
  return {
    ...(scope === 'withAccount' && {
      accountName: parseAccountName(getFieldValue(values, 'accountName'), text.siteAccountNameRequired),
    }),
    workDirectory: parseSiteDirectory(getFieldValue(values, 'personalWorkDirectory')) || null,
    variables: parseSiteVariables(getFieldValue(values, 'personalVariables')),
  };
}
