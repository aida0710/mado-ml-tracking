import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useProject } from '../hooks/useProject';

export interface BreadcrumbLink {
  to: string;
  label: string;
}

/**
 * Projectの画面の見出しの上に出す位置。どの画面もProjectの名前から始め、詳細の画面では親の一覧
 * （Experiments・Reportsなど）へのリンクを続ける。一覧の画面は`parents`を渡さない。
 */
export function ProjectBreadcrumb({ parents = [] }: { parents?: readonly BreadcrumbLink[] }) {
  const { project } = useProject();
  return (
    <>
      {project.name}
      {parents.map((parent) => (
        <Fragment key={parent.to}>
          <span className="breadcrumb-separator">/</span>
          <Link to={parent.to}>{parent.label}</Link>
        </Fragment>
      ))}
    </>
  );
}
