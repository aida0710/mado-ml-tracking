import type { ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  formatUrlForDisplay,
  getMarkdownImageDisplay,
  getSafeLinkHref,
  isExternalLink,
} from '../../lib/markdownSafety';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

// GFMはCommonMarkに表、タスクリスト、取り消し線、自動リンクを足す。
const REMARK_PLUGINS = [remarkGfm];
// URLは手を加えずに下の部品へ渡し、安全かどうかはMarkdownLinkとMarkdownImageが決める。
// 生のHTMLは有効にしない（rehype-rawを使わない）ので、react-markdownはそれを文字として出す。
const keepUrl = (url: string) => url;

function MarkdownLink({ href, children }: { href: string; children: ReactNode }) {
  useLocale();
  const safeHref = getSafeLinkHref(href);
  if (safeHref === null)
    return (
      <span className="markdown-unsafe-link" title={text.markdownUnsafeLink}>
        {children} &lt;{formatUrlForDisplay(href)}&gt;
      </span>
    );
  const external = isExternalLink(safeHref, window.location.origin);
  return (
    <a
      href={safeHref}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
    >
      {children}
    </a>
  );
}

function MarkdownImage({ src, alt }: { src: string; alt: string }) {
  useLocale();
  const display = getMarkdownImageDisplay(src, window.location.origin);
  if (display.kind === 'image') return <img src={display.src} alt={alt} loading="lazy" />;
  const label = alt || src;
  if (display.kind === 'text')
    return (
      <span className="markdown-unsafe-link" title={text.markdownUnsafeLink}>
        {label} &lt;{formatUrlForDisplay(src)}&gt;
      </span>
    );
  return (
    <a
      className="markdown-external-image"
      href={display.href}
      title={text.markdownExternalImage}
      target="_blank"
      rel="noopener noreferrer nofollow"
    >
      {label}
    </a>
  );
}

type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
const HEADING_TAGS = ['h2', 'h3', 'h4', 'h5', 'h6', 'h6'] as const;

/**
 * Markdownは既にh1のある画面（レポート、Run、コメント）の中に出すので、見出しの各階層を
 * 1つ下げる。#はh2になる。data-markdown-levelは、書いた階層の見た目を保つ。
 */
function shiftedHeading(level: MarkdownHeadingLevel) {
  const Tag = HEADING_TAGS[level - 1]!;
  return function MarkdownHeading({ children }: { children?: ReactNode }) {
    return <Tag data-markdown-level={level}>{children}</Tag>;
  };
}

const MARKDOWN_COMPONENTS: Components = {
  h1: shiftedHeading(1),
  h2: shiftedHeading(2),
  h3: shiftedHeading(3),
  h4: shiftedHeading(4),
  h5: shiftedHeading(5),
  h6: shiftedHeading(6),
  a: ({ href, children }) => <MarkdownLink href={String(href ?? '')}>{children}</MarkdownLink>,
  img: ({ src, alt }) => (
    <MarkdownImage src={typeof src === 'string' ? src : ''} alt={alt ?? ''} />
  ),
};

/**
 * Projectのメンバーや、MLflowのクライアントが書いたMarkdownを描く。生のHTMLは文字のままにし、
 * リンクは安全なスキームのときだけ開き、画像はこのサーバーのArtifactのものだけを読み込む。
 */
export function MarkdownView({ source }: { source: string }) {
  useLocale();
  return (
    <div className="markdown-view">
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        components={MARKDOWN_COMPONENTS}
        urlTransform={keepUrl}
      >
        {source}
      </Markdown>
    </div>
  );
}
