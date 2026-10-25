export type FormValues = Record<string, string | string[]>;

export interface SelectOption {
  value: string;
  label: string;
}

/** テキストの欄に入力中の値を補う候補と、値についての注記（任意）。 */
export interface FieldSuggestions {
  items: string[];
  /** 候補の横に出す短い情報。候補をキーにする（Pythonのバージョンなど）。 */
  details?: Record<string, string>;
  /** 欄の下に出す。たとえば、入力したパスが存在しないこと。 */
  note?: string;
  /** warning: 注記が、誤りらしいもの（大文字と小文字だけが違う名前など）を指している。 */
  noteTone?: 'warning';
}

/**
 * `value`の候補を引く。候補をどこから持ってくるか（API、決まった一覧）は呼び出し側が決める。
 * `signal`は、新しい値に置き換わった検索を中止する。
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
    /** 複数の値をチェックボックスで選ぶ（Ctrlクリック不要）。長い一覧には絞り込み欄を付ける。 */
    | 'checkboxes'
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
  /** 入力に合わせて、テキストの欄の下に候補を出す。 */
  suggest?: SuggestFieldValues;
  /** 空の欄でも候補を開く（入力前に見ておく価値のある短い一覧）。 */
  offerSuggestionsWhenEmpty?: boolean;
  /** この値が変わると、欄の今の値で候補を引き直す（後から届いた候補を反映するため）。 */
  suggestionsRefreshKey?: string | number;
  /** 欄の下に出す、何を入力するかの説明の1行。欄と一緒に読み上げる。 */
  hint?: string;
  /** 'checkboxes'の欄に選択肢が無いとき、空の一覧の代わりに出す。 */
  emptyText?: string;
}
