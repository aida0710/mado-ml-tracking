import { useMemo } from 'react';
import { highlightCode } from '@mado/design-system/code';
import type { CodeLanguageState } from '@mado/design-system/react';
import { useCodeLanguage } from '../../hooks/useCodeLanguage';
import { PreviewFormatSelect, TABLE_PREVIEW_FORMAT } from './PreviewFormatSelect';
import { useLocale } from '../../i18n/useLocale';


/**
 * 形式に合わせて色を付けたテキストのプレビュー（@mado/design-system/code）。形式はファイル名、
 * メディアタイプ、内容から判定する。同じ拡張子のファイルについては、テキストの上のselectで
 * 上書きできる。
 */
export function CodeView({
  content,
  fileName,
  mimeType,
}: {
  content: string;
  fileName: string;
  mimeType?: string;
}) {
  useLocale();
  const code = useCodeLanguage({ fileName, mimeType, text: content });
  return <FormattedCode content={content} code={code} />;
}

/**
 * `code`のとおりに色を付けたテキストと、その上の形式のselect。`onShowTable`があると、表として
 * 描けるファイルのためにselectに「表」も出す。
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
      {/* highlightCodeは文字をエスケープする。足すマークアップは色のためのspanだけ。 */}
      <pre className="code-view">
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}
