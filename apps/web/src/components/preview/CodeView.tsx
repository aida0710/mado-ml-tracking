import { useMemo } from 'react';
import { highlightCode } from '@mado/design-system/code';
import type { CodeLanguageState } from '@mado/design-system/react';
import { useCodeLanguage } from '../../hooks/useCodeLanguage';
import { PreviewFormatSelect, TABLE_PREVIEW_FORMAT } from './PreviewFormatSelect';
import { useLocale } from '../../i18n/useLocale';


/**
 * A text preview colored by its format (@mado/design-system/code). The format is detected from the
 * file name, media type and content; the select above the text overrides it for files with the
 * same extension.
 */
export function CodeView({
  content,
  fileName,
  mimeType,
}: {
  content: string;
  fileName?: string | null;
  mimeType?: string | null;
}) {
  useLocale();
  const code = useCodeLanguage({ fileName, mimeType, text: content });
  return <FormattedCode content={content} code={code} />;
}

/**
 * The text colored as `code` says, under its format select. With `onShowTable` the select also
 * offers 「表」, for a file the preview can draw as a table.
 */
export function FormattedCode({
  content,
  code,
  onShowTable,
}: {
  content: string;
  code: CodeLanguageState;
  onShowTable?: () => void;
}) {
  useLocale();
  const html = useMemo(() => highlightCode(content, code.language), [content, code.language]);
  return (
    <div className="code-preview">
      <div className="code-preview-toolbar">
        <PreviewFormatSelect
          value={code.choice}
          detected={code.detected}
          offersTable={Boolean(onShowTable)}
          onChange={(format) => (format === TABLE_PREVIEW_FORMAT ? onShowTable?.() : code.setChoice(format))}
        />
      </div>
      {/* highlightCode escapes the text; the only markup it adds is the spans for the colors. */}
      <pre className="code-view">
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}
