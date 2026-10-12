import { useId } from 'react';
import { CODE_LANGUAGES, type CodeLanguage } from '@mado/design-system/code';
import type { CodeLanguageChoice } from '../../hooks/useCodeLanguage';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

/** The table view of a CSV / TSV / jsonl file, offered beside the text formats. */
export const TABLE_PREVIEW_FORMAT = 'table';
export type PreviewFormat = CodeLanguageChoice | typeof TABLE_PREVIEW_FORMAT;

function formatName(language: CodeLanguage) {
  if (language === 'plaintext') return text.codeFormatText;
  if (language === 'log') return text.codeFormatLog;
  return CODE_LANGUAGES.find((item) => item.id === language)?.name ?? language;
}

/**
 * The ［表示形式］ select of a preview: 「自動」 with the detected format, every text format, and
 * 「表」 first for files that can be read as a table.
 */
export function PreviewFormatSelect({
  value,
  detected,
  offersTable,
  onChange,
}: {
  value: PreviewFormat;
  detected: CodeLanguage;
  offersTable: boolean;
  onChange: (format: PreviewFormat) => void;
}) {
  useLocale();
  const selectId = useId();
  return (
    <label className="code-format" htmlFor={selectId}>
      {text.codeFormat}
      <select id={selectId} value={value} onChange={(event) => onChange(event.target.value as PreviewFormat)}>
        {offersTable && <option value={TABLE_PREVIEW_FORMAT}>{text.previewFormatTable}</option>}
        <option value="auto">{textTemplates.codeFormatAuto(formatName(detected))}</option>
        {CODE_LANGUAGES.map((language) => (
          <option key={language.id} value={language.id}>
            {formatName(language.id)}
          </option>
        ))}
      </select>
    </label>
  );
}
