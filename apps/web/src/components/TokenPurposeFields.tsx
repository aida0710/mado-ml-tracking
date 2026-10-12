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
 * The token's purpose as a list of choices, and the scopes it selects as checkboxes beneath:
 * choosing a purpose checks its scopes, and changing a checkbox moves the purpose to the one those
 * scopes now match, or to choosing the scopes oneself.
 */
export function TokenPurposeFields({
  purposes,
  allowedScopes,
  value,
  onChange,
}: {
  purposes: readonly TokenPurposeOption[];
  /** The scopes the owner's role can hold; no others are offered. */
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
