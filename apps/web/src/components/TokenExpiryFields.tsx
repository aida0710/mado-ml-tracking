import { useId } from 'react';
import {
  TOKEN_EXPIRY_PRESET_DAYS,
  changeTokenExpiryOption,
  type TokenExpiryOption,
  type TokenExpirySelection,
  type TokenExpiryUnit,
} from '@mado/design-system/token-expiry';
import { formatLocalDateTimeInput } from '@mado/design-system/datetime-input';
import { ChoiceField } from './ChoiceField';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { serviceAccountsTextTemplates } from '../i18n/serviceAccounts';

/** The shared expiry selector for personal and Service Account tokens. */
export function TokenExpiryFields({ value, onChange }: {
  value: TokenExpirySelection;
  onChange: (value: TokenExpirySelection) => void;
}) {
  useLocale();
  const durationId = useId();
  const dateTimeId = useId();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <>
      <ChoiceField
        label={text.expiry}
        value={value.option}
        placeholder={text.expiry}
        options={[
          ...TOKEN_EXPIRY_PRESET_DAYS.map(days => ({
            value: String(days), label: serviceAccountsTextTemplates.tokenExpiryDays(days),
          })),
          { value: 'never', label: text.noExpiry },
          { value: 'custom', label: text.tokenExpiryCustom },
          { value: 'calendar', label: text.tokenExpiryCalendar },
        ]}
        onChange={option => onChange(changeTokenExpiryOption(value, option as TokenExpiryOption))}
      />
      {value.option === 'calendar' && (
        <div className="field token-expiry-calendar">
          <label htmlFor={dateTimeId}>{text.tokenExpiryDateTime}</label>
          <input
            id={dateTimeId}
            type="datetime-local"
            min={formatLocalDateTimeInput(new Date())}
            required
            value={value.dateTime}
            aria-describedby={`${dateTimeId}-hint`}
            onChange={event => onChange({ ...value, dateTime: event.target.value })}
          />
          <p id={`${dateTimeId}-hint`} className="field-hint">
            {serviceAccountsTextTemplates.tokenExpiryTimezone(timezone)}
          </p>
        </div>
      )}
      {value.option === 'custom' && (
        <div className="token-expiry-duration">
          <div className="field">
            <label htmlFor={durationId}>{text.tokenExpiryDuration}</label>
            <input
              id={durationId}
              type="number"
              min="0"
              step="any"
              required
              value={value.duration}
              onChange={event => onChange({ ...value, duration: event.target.value })}
            />
          </div>
          <ChoiceField
            label={text.tokenExpiryUnit}
            value={value.unit}
            placeholder={text.tokenExpiryUnit}
            options={[
              { value: 'minutes', label: text.tokenExpiryMinutes },
              { value: 'hours', label: text.tokenExpiryHours },
              { value: 'days', label: text.tokenExpiryDays },
            ]}
            onChange={unit => onChange({ ...value, unit: unit as TokenExpiryUnit })}
          />
        </div>
      )}
    </>
  );
}
