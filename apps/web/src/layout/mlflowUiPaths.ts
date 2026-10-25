/**
 * /projects/:projectIdの下で、MLflow UIのアドレスを読む経路。APIはtracking URIへの要求をここへ
 * リダイレクトし（apps/api/src/mlflow/uiLinkRoutes.ts）、ブラウザはリンクの#...の部分を
 * そのまま保つ。
 */
export const MLFLOW_UI_ROUTE = 'mlflow-ui';

// このアプリに対応する画面が無いMLflow UIのページを開いたときの行き先。
const FALLBACK_PROJECT_PATH = 'experiments';

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * MLflow UIのアドレスがこのアプリで開く場所を、/projects/<project>/の下のパスで返す。
 * MLflowのクライアントは"View run"と"View experiment"のリンクを次の形で出す。
 * <tracking URI>/#/experiments/<experiment>/runs/<run>と
 * <tracking URI>/#/experiments/<experiment>。
 * Runより後ろ（Artifactのタブ、?workspace=のようなクエリ）は捨てる。登録モデルへのリンクは
 * モデル名を指すが、この経路ではそれを引けないので、Modelsの一覧を開く。
 */
export function projectPathForMlflowUiHash(hash: string): string {
  const [route = ''] = hash.replace(/^#\/?/, '').split('?');
  const [section, experimentId, child, runId] = route.split('/').filter(Boolean).map(decodeSegment);
  if (section === 'models') return 'models';
  if (section !== 'experiments' || !experimentId) return FALLBACK_PROJECT_PATH;
  if (child === 'runs' && runId) return `runs/${encodeURIComponent(runId)}`;
  return `experiments?${new URLSearchParams({ experiment: experimentId })}`;
}
