import type { TokenScope } from '@mmt/contracts';
import { CheckboxList } from './CheckboxList';
import { OptionPicker } from './OptionPicker';
import { toggleValue } from '../lib/formValues';
import {
  purposeForScopes,
  scopesForPurpose,
  type TokenPurposeOption,
  type TokenScopeChoice,
} from '../lib/tokenPurposes';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { tokenPurposeLabels, tokenScopeLabels } from '../i18n/serviceAccounts';

/**
 * tokenの用途を選択肢の一覧で示し、その下に用途が選ぶscopeをチェックボックスで並べる。用途を選ぶと
 * そのscopeにチェックが入り、チェックボックスを変えると、用途はそのscopeに今一致するものか、
 * scopeを自分で選ぶ選択肢に移る。
 */
export function TokenPurposeFields({
  purposes,
  allowedScopes,
  value,
  onChange,
}: {
  purposes: readonly TokenPurposeOption[];
  /** 所有者のRoleが持てるscope。これ以外は候補に出さない。 */
  allowedScopes: readonly TokenScope[];
  value: TokenScopeChoice;
  onChange: (value: TokenScopeChoice) => void;
}) {
  useLocale();
  return (
    <>
      <OptionPicker
        name="token-purpose"
        legend={text.tokenPurpose}
        options={purposes.map((purpose) => ({
          value: purpose,
          label: tokenPurposeLabels[purpose].label,
          hint: tokenPurposeLabels[purpose].hint,
        }))}
        value={value.purpose}
        onChange={(purpose) => onChange({ purpose, scopes: scopesForPurpose(purpose, value.scopes) })}
        hint={text.tokenPurposeHint}
      />
      <CheckboxList
        legend={text.scopes}
        options={allowedScopes.map((scope) => ({ value: scope, label: tokenScopeLabels[scope] }))}
        selected={value.scopes}
        onToggle={(scope) => {
          const scopes = toggleValue(value.scopes, scope as TokenScope);
          onChange({ purpose: purposeForScopes(scopes, purposes), scopes });
        }}
      />
    </>
  );
}
