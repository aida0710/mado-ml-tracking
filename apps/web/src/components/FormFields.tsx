import { useId } from 'react';
import type { FormField, FormValues } from '../types/form';
import { getFieldValue, getSelectedValues, toggleValue } from '../lib/formValues';
import { SuggestionInput } from './SuggestionInput';
import { CheckboxList } from './CheckboxList';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

function RequiredMark() {
  useLocale();
  return (
    <span className="required" aria-hidden="true">
      {' '}
      *
    </span>
  );
}

export function FormFields({
  fields,
  values,
  onChange,
}: {
  fields: FormField[];
  values: FormValues;
  onChange: (values: FormValues) => void;
}) {
  useLocale();
  const idPrefix = useId();
  return (
    <div className="form-fields">
      {fields
        .filter((field) => !field.visible || field.visible(values))
        .map((field) => {
          const id = `${idPrefix}-${field.name}`;
          const hintId = field.hint ? `${id}-hint` : undefined;
          const value = getFieldValue(values, field.name);
          const change = (next: string | string[]) => onChange({ ...values, [field.name]: next });
          if (field.type === 'checkboxes')
            return (
              <CheckboxList
                key={field.name}
                legend={
                  <>
                    {field.label}
                    {field.required && <RequiredMark />}
                  </>
                }
                options={field.options ?? []}
                selected={getSelectedValues(values, field.name)}
                onToggle={(option) =>
                  change(toggleValue(getSelectedValues(values, field.name), option))
                }
                empty={field.emptyText}
                hint={field.hint}
                filterLabel={text.filter}
              />
            );
          if (field.type === 'checkbox')
            return (
              <label className="checkbox-field" key={field.name}>
                <input
                  type="checkbox"
                  checked={value === 'true'}
                  onChange={(event) => change(String(event.target.checked))}
                />
                {field.label}
              </label>
            );
          return (
            <div className="field" key={field.name}>
              <label htmlFor={id}>
                {field.label}
                {field.required && <RequiredMark />}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  id={id}
                  value={value}
                  aria-describedby={hintId}
                  rows={4}
                  required={field.required}
                  maxLength={field.maxLength}
                  placeholder={field.placeholder}
                  onChange={(event) => change(event.target.value)}
                />
              ) : field.type === 'select' || field.type === 'multiselect' ? (
                <select
                  id={id}
                  multiple={field.type === 'multiselect'}
                  value={
                    field.type === 'multiselect' ? getSelectedValues(values, field.name) : value
                  }
                  required={field.required}
                  onChange={(event) =>
                    change(
                      field.type === 'multiselect'
                        ? Array.from(event.target.selectedOptions, (option) => option.value)
                        : event.target.value,
                    )
                  }
                >
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.suggest ? (
                <SuggestionInput
                  id={id}
                  value={value}
                  onChange={change}
                  suggest={field.suggest}
                  required={field.required}
                  readOnly={field.readOnly}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  offerWhenEmpty={field.offerSuggestionsWhenEmpty}
                  refreshKey={field.suggestionsRefreshKey}
                  describedBy={hintId}
                />
              ) : (
                <input
                  id={id}
                  type={field.type ?? 'text'}
                  value={value}
                  required={field.required}
                  readOnly={field.readOnly}
                  // Keeps the browser from filling a saved login password into a secret field.
                  autoComplete={field.type === 'password' ? 'new-password' : undefined}
                  min={field.min}
                  max={field.max}
                  maxLength={field.maxLength}
                  placeholder={field.placeholder}
                  aria-describedby={hintId}
                  onChange={(event) => change(event.target.value)}
                />
              )}
              {field.hint && (
                <p id={hintId} className="field-hint">
                  {field.hint}
                </p>
              )}
            </div>
          );
        })}
    </div>
  );
}
