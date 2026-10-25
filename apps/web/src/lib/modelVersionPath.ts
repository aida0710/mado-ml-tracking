// モデルバージョンの画面。バージョンのidしか知らない画面は、引き続きmodels?version=へリンクする。
export function modelVersionPath(
  projectId: string,
  version: { modelId: string; versionId: string },
): string {
  return `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(version.modelId)}/versions/${encodeURIComponent(version.versionId)}`;
}
