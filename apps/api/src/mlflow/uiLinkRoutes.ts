import { Hono } from 'hono';
import { uuidParam, type ApiEnvironment } from '../http/request.js';

// MLflow UIのアドレスを読む画面の経路。apps/web/src/layout/MlflowUiRedirect.tsx。
const MLFLOW_UI_WEB_PATH = 'mlflow-ui';

/**
 * MLflowのクライアントは"View run"と"View experiment"のリンクを、MLflow UIの形
 * <tracking URI>/#/experiments/<experiment>/runs/<run>で表示する。ブラウザがここへ送るのは
 * <tracking URI>/だけなので、#より後ろを読む画面のページへリダイレクトする。フラグメントは
 * ブラウザがリダイレクトの先へ引き継ぐ（RFC 9110の10.2.2節）。
 *
 * MLflowの接続カードに出すtracking URIは画面と同じオリジンにあるので、Locationは相対にする。
 * Projectについて何も明かさないので、ここではサインインを求めない。サインインと権限は、ほかの
 * ページと同じく画面のページで確かめる。
 */
export function mlflowUiLinkRoutes(): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  // SDKのリンクはtracking URIの末尾にスラッシュを付ける。そのまま貼ったtracking URIには付かない。
  for (const trackingUriPath of ['/:p', '/:p/'])
    routes.get(trackingUriPath, (context) => {
      const projectId = uuidParam(context, 'p');
      return context.redirect(
        `/projects/${encodeURIComponent(projectId)}/${MLFLOW_UI_WEB_PATH}`,
        302,
      );
    });
  return routes;
}
