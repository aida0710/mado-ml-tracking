import { useRef, type ReactNode } from 'react';
import { usePageDocumentTitle } from '../hooks/usePageDocumentTitle';

/** 画面の見出し。ブラウザのタブの名前にもなり、見出し、その上の行の順に並べる。 */
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
          // 上の行はたいてい今の画面までの道筋（プロジェクト・一覧）なので、パンくずの並べ方にする。
          <div className="eyebrow breadcrumbs" ref={eyebrowRef}>
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
