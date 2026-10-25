import { Hono } from 'hono';
import { z } from 'zod';
import type { Database } from '../../db/database.js';
import { DomainError } from '../../domain/errors.js';
import { uuidSchema } from '../../domain/validation.js';
import { declaredContentLength, requestBodyStream } from '../../http/requestBodyStream.js';
import {
  jsonBody,
  parse,
  principal,
  uuidParam,
  type ApiContext,
  type ApiEnvironment,
} from '../../http/request.js';
import { ArtifactDeletionService } from '../../services/artifactDeletionService.js';
import type { ArtifactService } from '../../services/artifactService.js';
import {
  artifactRootUri,
  ARTIFACT_TRANSFER_ROOT,
  decodeArtifactLocation,
  parseArtifactLocation,
  validateArtifactOwner,
} from './artifactPath.js';
import { artifactContentResponse } from './artifactResponse.js';
import type { CheckpointService } from '../../services/checkpointService.js';
import { ArtifactTransferService } from './artifactTransferService.js';
import {
  abortMultipartRequestSchema,
  completeMultipartRequestSchema,
  createMultipartRequestSchema,
  createMultipartResponse,
  decodeMultipartDirectory,
  encodedMultipartTarget,
  MULTIPART_PART_ROUTE,
  MULTIPART_UPLOAD_ROOT,
  multipartArtifactLocation,
  multipartPartsUrl,
  PART_TOKEN_HEADER,
  partNumberSchema,
  partSha256FromEtag,
  type MultipartAction,
} from './multipartProtocol.js';
import type { MlflowMultipartUploadService } from './multipartUploadService.js';
import { multipartUnsupportedRoutes } from './multipartUnsupported.js';
import type { ArtifactAccess, ArtifactLocation } from './artifactTypes.js';

const proxyListQuery = z.strictObject({ path: z.string() });
const runListQuery = z.strictObject({
  run_id: uuidSchema.optional(),
  run_uuid: uuidSchema.optional(),
  path: z.string().default(''),
  // 一覧は直下の子をすべて返すので、受け付ける次のページのtokenは無い。
  page_token: z.literal('').optional(),
});
const modelListQuery = z.strictObject({
  model_id: z.string().optional(),
  artifact_directory_path: z.string().default(''),
  page_token: z.literal('').optional(),
});
const modelFileQuery = z.strictObject({ artifact_file_path: z.string().min(1) });

function artifactAccess(
  context: ApiContext,
  location: ArtifactLocation,
): ArtifactAccess & { path: string } {
  return { ...location, principal: principal(context), projectId: uuidParam(context, 'p') };
}

function transferLocation(
  context: ApiContext,
  options: { directory?: boolean } = {},
): ArtifactLocation {
  const encodedPath = new URL(context.req.url).pathname;
  const rootPosition = encodedPath.indexOf(`${ARTIFACT_TRANSFER_ROOT}/`);
  if (rootPosition < 0)
    throw new DomainError({
      status: 422,
      code: 'invalid_request',
      message: 'invalid artifact path',
    });
  return decodeArtifactLocation(
    encodedPath.slice(rootPosition + ARTIFACT_TRANSFER_ROOT.length + 1),
    options,
  );
}

/** mpuのURLのディレクトリと、リクエストの本文のローカルのファイルパスが指すArtifact。 */
function multipartLocation(
  context: ApiContext,
  action: MultipartAction,
  localPath: string,
): ArtifactLocation {
  const encodedPath = new URL(context.req.url).pathname;
  return multipartArtifactLocation(
    decodeMultipartDirectory(encodedMultipartTarget(encodedPath, action)),
    localPath,
  );
}

function mlflowMultipartRoutes(multipart: MlflowMultipartUploadService): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  routes.post(`${MULTIPART_UPLOAD_ROOT}/create/*`, async (context) => {
    principal(context);
    const body = await jsonBody(context, createMultipartRequestSchema);
    const location = multipartLocation(context, 'create', body.path);
    const created = await multipart.create({
      ...artifactAccess(context, location),
      partCount: body.num_parts,
    });
    return context.json(
      createMultipartResponse({
        ...created,
        partsUrl: multipartPartsUrl(context.req.url, context.req.header('X-Forwarded-Proto')),
      }),
    );
  });

  // Authorizationは無い。PART_TOKEN_HEADERにあるsessionのpart tokenが認証情報になる。
  routes.put(MULTIPART_PART_ROUTE, async (context) => {
    const stored = await multipart.uploadPart({
      projectId: uuidParam(context, 'p'),
      uploadId: uuidParam(context, 'uploadId'),
      partNumber: parse(partNumberSchema, context.req.param('partNumber')),
      partToken: context.req.header(PART_TOKEN_HEADER),
      declaredBytes: declaredContentLength(context),
      body: requestBodyStream(context),
    });
    context.header('ETag', stored.etag);
    return context.body(null, 200);
  });

  routes.post(`${MULTIPART_UPLOAD_ROOT}/complete/*`, async (context) => {
    principal(context);
    const body = await jsonBody(context, completeMultipartRequestSchema);
    const location = multipartLocation(context, 'complete', body.path);
    await multipart.complete({
      ...artifactAccess(context, location),
      uploadId: body.upload_id,
      parts: body.parts.map((part) => ({
        partNumber: part.part_number,
        sha256: partSha256FromEtag(part.etag),
      })),
    });
    return context.json({});
  });

  routes.post(`${MULTIPART_UPLOAD_ROOT}/abort/*`, async (context) => {
    principal(context);
    const body = await jsonBody(context, abortMultipartRequestSchema);
    const location = multipartLocation(context, 'abort', body.path);
    await multipart.abort({ ...artifactAccess(context, location), uploadId: body.upload_id });
    return context.json({});
  });
  return routes;
}

export function mlflowArtifactRoutes(options: {
  database: Database;
  artifacts: ArtifactService;
  /** MMT_MLFLOW_MULTIPART_UPLOADS=falseなら無い。そのときmpu/*はSDKが切り替えに使う501を返す。 */
  multipart?: MlflowMultipartUploadService;
  checkpoints?: CheckpointService;
  /** 既定では同じデータベースのサービスを使う。アプリはネイティブの経路と同じものを渡す。 */
  deletions?: ArtifactDeletionService;
}): Hono<ApiEnvironment> {
  const routes = new Hono<ApiEnvironment>();
  const transfers = new ArtifactTransferService({
    database: options.database,
    artifacts: options.artifacts,
    checkpoints: options.checkpoints,
    deletions: options.deletions ?? new ArtifactDeletionService(options.database),
  });

  routes.get(ARTIFACT_TRANSFER_ROOT, async (context) => {
    const query = parse(proxyListQuery, context.req.query());
    const location = parseArtifactLocation(query.path, { directory: true });
    const files = await transfers.list(artifactAccess(context, location));
    // HttpArtifactRepositoryはディレクトリを自分で前に付けるので、このAPIはbasenameを返す。
    return context.json({
      files: files.map((file) => ({ ...file, path: file.path.split('/').at(-1)! })),
    });
  });

  routes.put(`${ARTIFACT_TRANSFER_ROOT}/*`, async (context) => {
    const location = transferLocation(context);
    await transfers.upload({
      ...artifactAccess(context, location),
      body: requestBodyStream(context),
      mimeType: context.req.header('Content-Type') ?? 'application/octet-stream',
    });
    return context.json({});
  });

  // HttpArtifactRepository.delete_artifactsは、ファイルかディレクトリのパスを送る。
  // ルートなら何も送らない。
  routes.delete(`${ARTIFACT_TRANSFER_ROOT}/*`, async (context) => {
    await transfers.delete(artifactAccess(context, transferLocation(context, { directory: true })));
    return context.json({});
  });

  routes.get(`${ARTIFACT_TRANSFER_ROOT}/*`, async (context) =>
    artifactContentResponse(
      await transfers.content({
        ...artifactAccess(context, transferLocation(context)),
        range: context.req.header('Range'),
      }),
    ),
  );

  routes.get('/api/2.0/mlflow/artifacts/list', async (context) => {
    const query = parse(runListQuery, context.req.query());
    const id = query.run_id ?? query.run_uuid;
    if (!id || (query.run_id && query.run_uuid && query.run_id !== query.run_uuid))
      throw new DomainError({
        status: 422,
        code: 'invalid_request',
        message: 'run_id is required',
      });
    const owner = validateArtifactOwner({ kind: 'run', id });
    const files = await transfers.list(artifactAccess(context, { owner, path: query.path }));
    return context.json({ root_uri: artifactRootUri(owner), files });
  });

  routes.get('/api/2.0/mlflow/logged-models/:model_id/artifacts/directories', async (context) => {
    const query = parse(modelListQuery, context.req.query());
    const owner = validateArtifactOwner({ kind: 'model', id: context.req.param('model_id') });
    if (query.model_id && query.model_id !== owner.id)
      throw new DomainError({
        status: 422,
        code: 'invalid_request',
        message: 'model_id does not match',
      });
    const files = await transfers.list(
      artifactAccess(context, { owner, path: query.artifact_directory_path }),
    );
    return context.json({ root_uri: artifactRootUri(owner), files });
  });

  routes.route(
    '/',
    options.multipart ? mlflowMultipartRoutes(options.multipart) : multipartUnsupportedRoutes(),
  );

  // 公式のUIはfilesのクエリの経路を使う。SDKのダウンロードは上の転送用のGETを使う。
  routes.get('/api/2.0/mlflow/logged-models/:model_id/artifacts/files', async (context) => {
    const query = parse(modelFileQuery, context.req.query());
    const owner = validateArtifactOwner({ kind: 'model', id: context.req.param('model_id') });
    return artifactContentResponse(
      await transfers.content({
        ...artifactAccess(context, { owner, path: query.artifact_file_path }),
        range: context.req.header('Range'),
      }),
    );
  });
  return routes;
}
