/*
 * APIの経路。JSONの応答は@mado/design-system/httpのrequestJsonで読み、@mmt/contracts/schemasのスキーマで
 * 確かめる。本文をJSONとして読まない取得（Artifactの中身、CSV）は同じくfetchResponseを使う。
 */

// 手前のプロキシがAPIより先にHTMLで413を返すと、APIの文が無い。画面の言語の文で出すため、画面でcodeを付ける。
export const ARTIFACT_TOO_LARGE_CODE = 'artifact_too_large';

export const encodeId = encodeURIComponent;
export const projectPath = (projectId: string) => `/api/projects/${encodeId(projectId)}`;
