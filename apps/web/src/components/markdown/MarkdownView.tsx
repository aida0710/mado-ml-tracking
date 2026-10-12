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

// GFM adds tables, task lists, strikethrough and autolinks to CommonMark.
const REMARK_PLUGINS = [remarkGfm];
// URLs reach the components below unchanged; MarkdownLink and MarkdownImage decide what is safe.
// Raw HTML is never enabled (no rehype-raw), so react-markdown shows it as text.
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
 * Markdown is shown inside a screen that already has its h1 (a report, a Run, a comment), so each
 * level moves one down: # is an h2. data-markdown-level keeps the look of the level written.
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
 * Renders Markdown written by project members or MLflow clients. Raw HTML stays text, links
 * open only for safe schemes, and only Artifact images from this server are loaded.
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
