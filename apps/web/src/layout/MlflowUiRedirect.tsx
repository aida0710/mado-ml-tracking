import { Navigate, useLocation, useParams } from 'react-router-dom';
import { projectPathForMlflowUiHash } from './mlflowUiPaths';

/**
 * Opens the page an MLflow client link points at ("View run", "View experiment"), replacing the
 * entry so Back does not bounce through it.
 */
export function MlflowUiRedirect() {
  const { projectId = '' } = useParams();
  const { hash } = useLocation();
  return <Navigate replace to={`/projects/${projectId}/${projectPathForMlflowUiHash(hash)}`} />;
}
