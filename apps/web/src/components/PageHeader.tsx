import { useRef, type ReactNode } from 'react';
import { usePageDocumentTitle } from '../hooks/usePageDocumentTitle';

/** A screen's heading. It also names the browser tab: the title, then the line above it. */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const eyebrowRef = useRef<HTMLDivElement>(null);
  usePageDocumentTitle([titleRef, eyebrowRef]);
  return (
    <header className="page-header">
      <div>
        {eyebrow && (
          <div className="eyebrow" ref={eyebrowRef}>
            {eyebrow}
          </div>
        )}
        <h1 ref={titleRef}>{title}</h1>
        {description && <div className="page-description">{description}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
