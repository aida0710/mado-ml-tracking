import { Hono } from 'hono';
import { principal, type ApiEnvironment } from '../../http/request.js';
import { MULTIPART_UPLOAD_ROOT } from './multipartProtocol.js';

/**
 * mlflow.exceptions._UnsupportedMultipartUploadException.MESSAGEとバイト単位で一致しなければ
 * ならない。HttpArtifactRepositoryは、エラーのメッセージがこの文で始まるときだけ通常のPUTに
 * 切り替える。ほかのメッセージではマルチパートアップロードが失敗する。
 */
export const UNSUPPORTED_MULTIPART_UPLOAD_MESSAGE =
  'Multipart upload is not supported for the current artifact repository';

const MULTIPART_UPLOAD_ACTIONS = ['create', 'complete', 'abort'] as const;

/**
 * SDKのメッセージを付けて501で答え、SDKが同じファイルを1回のストリームのPUTで送るようにする。
 * 空のファイルやマルチパートに対応しない保存先など、sessionのAPIが受けられないアップロードに使う。
 */
export class MultipartUploadUnsupportedError extends Error {
  constructor() {
    super(UNSUPPORTED_MULTIPART_UPLOAD_MESSAGE);
    this.name = 'MultipartUploadUnsupportedError';
  }
}

// MMT_MLFLOW_MULTIPART_UPLOADS=falseのときに載せる。マルチパートを強いられたSDKは、
// そのとき1回のPUTでストリームとして送る。
export function multipartUnsupportedRoutes(): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  for (const action of MULTIPART_UPLOAD_ACTIONS)
    routes.post(`${MULTIPART_UPLOAD_ROOT}/${action}/*`, (context) => {
      principal(context);
      throw new MultipartUploadUnsupportedError();
    });
  return routes;
}
