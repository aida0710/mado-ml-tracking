export type FormValues = Record<string, string | string[]>;

export interface SelectOption {
  value: string;
  label: string;
}

/** Candidates that complete what is typed in a text field, and an optional note about the value. */
export interface FieldSuggestions {
  items: string[];
  /** A short fact shown beside a candidate, keyed by the candidate (a Python's version). */
  details?: Record<string, string>;
  /** Shown under the field, for example that the typed path does not exist. */
  note?: string;
}

/**
 * Looks up the candidates for `value`. The caller decides where they come from (an API, a fixed
 * list); `signal` aborts a lookup that a newer value has replaced.
 */
export type SuggestFieldValues = (value: string, signal: AbortSignal) => Promise<FieldSuggestions>;

export interface FormField {
  name: string;
  label: string;
  type?:
    | 'text'
    | 'email'
    | 'url'
    | 'password'
    | 'number'
    | 'textarea'
    | 'select'
    | 'multiselect'
    | 'datetime-local'
    | 'checkbox';
  required?: boolean;
  defaultValue?: string | string[];
  options?: SelectOption[];
  placeholder?: string;
  visible?: (values: FormValues) => boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  readOnly?: boolean;
  /** Offers candidates under a text field as it is typed. */
  suggest?: SuggestFieldValues;
  /** Opens the candidates on an empty field too (a short list worth seeing before typing). */
  offerSuggestionsWhenEmpty?: boolean;
  /** A new value looks the field's value up again (candidates that arrived later). */
  suggestionsRefreshKey?: string | number;
  /** A line under the field about what to enter, read with the field. */
  hint?: string;
}
