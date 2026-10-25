import { Navigate, useLocation, useParams } from 'react-router-dom';
import { projectPathForMlflowUiHash } from './mlflowUiPaths';

/**
 * MLflowのクライアントが出すリンク（"View run"、"View experiment"）の指すページを開く。履歴の
 * 項目を置き換えるので、ブラウザで戻ってもこの画面を経由して送り返されない。
 */
export function MlflowUiRedirect() {
  const { projectId = '' } = useParams();
  const { hash } = useLocation();
  return <Navigate replace to={`/projects/${projectId}/${projectPathForMlflowUiHash(hash)}`} />;
}
