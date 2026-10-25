import { useId, useState } from 'react';
import { Tabs } from '../Tabs';
import { MarkdownView } from './MarkdownView';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

type MarkdownEditorTab = 'write' | 'preview';

/**
 * プレビューのタブと、maxLengthまでの残りの文字数を持つMarkdownのtextarea。上限を超えた
 * 入力も残し、打ったものを失わないようにする。保存を止めるのは呼び出し側。
 */
export function MarkdownEditor({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  rows = 8,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
}) {
  useLocale();
  const id = useId();
  const [tab, setTab] = useState<MarkdownEditorTab>('write');
  // APIの長さの検査と同じ単位の、UTF-16のコード単位で数える。
  const remaining = maxLength - value.length;
  return (
    <div className="markdown-editor">
      <Tabs
        tabs={[
          { key: 'write', label: text.markdownWrite },
          { key: 'preview', label: text.markdownPreview },
        ]}
        selected={tab}
        onSelect={(key) => setTab(key === 'preview' ? 'preview' : 'write')}
        panelId={`${id}-panel`}
      />
      <div id={`${id}-panel`} role="tabpanel" aria-label={label}>
        {tab === 'write' ? (
          <textarea
            aria-label={label}
            aria-describedby={`${id}-count`}
            value={value}
            rows={rows}
            placeholder={placeholder}
            autoFocus={autoFocus}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : value.trim() ? (
          <div className="markdown-editor-preview">
            <MarkdownView source={value} />
          </div>
        ) : (
          <p className="markdown-editor-preview muted">{text.markdownPreviewEmpty}</p>
        )}
      </div>
      <div className="markdown-editor-footer">
        <span className="muted">{text.markdownHint}</span>
        <span
          id={`${id}-count`}
          className={remaining < 0 ? 'markdown-editor-count over' : 'markdown-editor-count'}
          aria-live="polite"
        >
          {textTemplates.markdownRemaining(remaining)}
        </span>
      </div>
    </div>
  );
}
