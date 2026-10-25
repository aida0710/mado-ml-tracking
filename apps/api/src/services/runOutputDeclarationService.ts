import type { Job, Run, RunOutputDeclaration, TaskOutputModel } from '@mmt/contracts';
import type { PoolClient } from 'pg';
import { first, rows, type Connection } from '../db/database.js';
import { conflict, DomainError, notFound } from '../domain/errors.js';
import { isTerminalStatus } from '../domain/runTransitions.js';
import {
  assertDeclarationLimits,
  assertModelOutputsAllowed,
  chooseOutputModelId,
  containerArtifactPath,
  countDeclarations,
  type DatasetOutputDeclaration,
  type ModelOutputDeclaration,
  type ParsedOutputDeclaration,
} from '../domain/workerOutputValidation.js';
import { findRun } from '../repositories/registryRepository.js';
import {
  findLatestRunArtifact,
  findOrCreateOutputModel,
  findOutputModelById,
  hasRunArtifactsUnder,
  type OutputModel,
} from '../repositories/runOutputRegistrationRepository.js';
import { directoryPrefix } from './artifactListing.js';
import { registerDatasetVersion } from './datasetVersionRegistration.js';
import { resolveDatasetContent } from './datasetContentService.js';
import type { ModelVersionRegistrar } from './outputRegistrationHandler.js';

// 1つのリクエストのすべての宣言が共有するもの。JobのRunと、そのTaskの出力の設定。
interface DeclarationContext {
  projectId: string;
  run: Run;
  taskOutputModel: TaskOutputModel | null;
  // 最初のモデルの宣言のときに解決する。createModelが登録モデルを作ることがある。
  taskModelId?: string | null;
}

const declarationColumns =
  'declaration_index AS index,kind,model_version_id,dataset_version_id,created_at';

/**
 * コンテナがresult.jsonのversion 2で宣言した出力を、Runの作成者として登録する。呼び出し元は
 * workerのleaseを確かめ、Jobの行を押さえているので、1つのJobのリクエストは1つずつ動く。
 * 登録したバージョンはすぐに自動実行を始める。まだ実行中のRunでは、自動実行は保留として待ち、
 * Runが終わったときに始めるか見送る。
 */
export class RunOutputDeclarationService {
  constructor(private readonly registry: ModelVersionRegistrar) {}

  async register(
    connection: PoolClient,
    request: { job: Job; declarations: ParsedOutputDeclaration[] },
  ): Promise<RunOutputDeclaration[]> {
    const { job, declarations } = request;
    const reference = { projectId: job.projectId, runId: job.runId };
    const stored = new Map(
      (await listRunOutputDeclarations(connection, reference)).map((row) => [row.index, row]),
    );
    for (const declaration of declarations) {
      const previous = stored.get(declaration.index);
      if (previous && previous.kind !== declaration.kind)
        throw new DomainError({
          status: 409,
          code: 'output_declaration_mismatch',
          message: 'an output of a different kind is already registered at the same index',
        });
    }
    const pending = declarations.filter((declaration) => !stored.has(declaration.index));
    if (!pending.length) return declarations.map((declaration) => stored.get(declaration.index)!);
    if (isTerminalStatus(job.status)) conflict('the job has already ended');
    const run = await findRun(connection, { projectId: job.projectId, id: job.runId });
    assertModelOutputsAllowed(run, countDeclarations(pending));
    assertDeclarationLimits(countDeclarations([...stored.values(), ...pending]));
    const context: DeclarationContext = {
      projectId: job.projectId,
      run,
      taskOutputModel: run.outputModelRegistration ?? null,
    };
    for (const declaration of pending) {
      const registered =
        declaration.kind === 'model'
          ? {
              modelVersionId: await this.registerModel(connection, context, declaration),
            }
          : {
              datasetVersionId: await registerDataset(connection, context, declaration),
            };
      stored.set(
        declaration.index,
        await insertRunOutputDeclaration(connection, {
          ...reference,
          index: declaration.index,
          kind: declaration.kind,
          ...registered,
        }),
      );
    }
    return declarations.map((declaration) => stored.get(declaration.index)!);
  }

  private async registerModel(
    connection: PoolClient,
    context: DeclarationContext,
    declaration: ModelOutputDeclaration,
  ): Promise<string> {
    const { projectId, run, taskOutputModel } = context;
    context.taskModelId ??= taskOutputModel
      ? (
          await resolveTaskModel(connection, {
            projectId,
            settings: taskOutputModel,
          })
        ).id
      : null;
    const modelId = chooseOutputModelId({
      declaredModelId: declaration.modelId,
      taskModelId: context.taskModelId,
    });
    if (!taskOutputModel)
      assertUsableModel(await findOutputModelById(connection, { projectId, id: modelId }));
    const artifactId = await requireOutputArtifact(connection, {
      projectId,
      runId: run.id,
      outputPath: declaration.path,
    });
    const version = await this.registry.registerModelVersion(connection, {
      projectId,
      modelId,
      sourceRunId: run.id,
      parentVersionIds: run.modelVersionId ? [run.modelVersionId] : [],
      artifactId,
      defaultCodeVersionId: taskOutputModel?.defaultCodeVersionId ?? null,
      metadata: declaration.metadata,
      actor: { type: 'runCreator' },
    });
    return version.id;
  }
}

async function registerDataset(
  connection: PoolClient,
  context: DeclarationContext,
  declaration: DatasetOutputDeclaration,
): Promise<string> {
  const { projectId, run } = context;
  const content =
    'path' in declaration
      ? {
          content: await resolveDatasetOutput(connection, {
            projectId,
            runId: run.id,
            outputPath: declaration.path,
          }),
        }
      : { uri: declaration.uri, digest: declaration.digest };
  // Artifactのmanifestを固定し、後のworkerがデータセットのAPIからまったく同じファイルを
  // 取れるようにする。
  const version = await registerDatasetVersion(connection, {
    projectId,
    datasetId: declaration.datasetId,
    ...content,
    schema: declaration.schema,
    metadata: declaration.metadata,
    sourceRunId: run.id,
    parentDatasetVersionIds: run.inputDatasetVersionIds,
    actor: { type: 'runCreator' },
  });
  return version.id;
}

/**
 * `path`で宣言したデータセットのファイル。そのパスに保存された出力のファイル。パスが
 * ディレクトリなら、その下に保存されたすべての出力（パスはそのディレクトリからの相対パス）。
 */
async function resolveDatasetOutput(
  connection: Connection,
  reference: { projectId: string; runId: string; outputPath: string },
) {
  const { projectId, runId, outputPath } = reference;
  const artifactPath = containerArtifactPath(outputPath);
  const fileArtifactId = await findLatestRunArtifact(connection, {
    projectId,
    runId,
    path: artifactPath,
  });
  if (fileArtifactId)
    return resolveDatasetContent(connection, {
      projectId,
      content: { kind: 'artifacts', files: [{ path: outputPath, artifactId: fileArtifactId }] },
    });
  const prefix = directoryPrefix(artifactPath);
  if (!(await hasRunArtifactsUnder(connection, { projectId, runId, prefix })))
    outputArtifactNotFound(outputPath);
  // RunのArtifactから作ったバージョンと同じく、一覧はMAX_DATASET_VERSION_FILESで止まる。
  return resolveDatasetContent(connection, {
    projectId,
    content: { kind: 'artifacts', fromRunArtifacts: { runId, prefix } },
  });
}

async function resolveTaskModel(
  connection: Connection,
  request: { projectId: string; settings: TaskOutputModel },
): Promise<OutputModel> {
  const { projectId, settings } = request;
  const model = settings.createModel
    ? await findOrCreateOutputModel(connection, {
        projectId,
        ...settings.createModel,
      })
    : await findOutputModelById(connection, {
        projectId,
        id: settings.modelId!,
      });
  assertUsableModel(model);
  // Taskを保存したあとで、同じ名前の登録モデルが別のfamilyで作られていることがある。
  if (settings.createModel && model.family !== settings.createModel.family)
    throw new DomainError({
      status: 422,
      code: 'model_family_mismatch',
      message: 'a model with the same name as the model the task creates exists in another family',
    });
  return model;
}

function assertUsableModel(model: OutputModel | undefined): asserts model is OutputModel {
  if (!model) notFound('model');
  // MLflowで論理削除した登録モデルは行が残る。登録すると、利用者が消した登録モデルを
  // 生き返らせてしまう。
  if (model.deleted) throw new DomainError({
    status: 422,
    code: 'model_deleted',
    message: 'the model has been deleted',
  });
}

async function requireOutputArtifact(
  connection: Connection,
  reference: { projectId: string; runId: string; outputPath: string },
): Promise<string> {
  const artifactId = await findLatestRunArtifact(connection, {
    projectId: reference.projectId,
    runId: reference.runId,
    path: containerArtifactPath(reference.outputPath),
  });
  if (!artifactId) outputArtifactNotFound(reference.outputPath);
  return artifactId;
}

function outputArtifactNotFound(outputPath: string): never {
  throw new DomainError({
    status: 422,
    code: 'output_artifact_not_found',
    message: `output ${outputPath} is not stored as an artifact of this job`,
    details: { path: outputPath },
  });
}

async function listRunOutputDeclarations(
  connection: Connection,
  reference: { projectId: string; runId: string },
): Promise<RunOutputDeclaration[]> {
  return rows<RunOutputDeclaration>(
    connection,
    `SELECT ${declarationColumns} FROM run_output_declarations
    WHERE project_id=$1 AND run_id=$2 ORDER BY declaration_index`,
    [reference.projectId, reference.runId],
  );
}

async function insertRunOutputDeclaration(
  connection: Connection,
  record: {
    projectId: string;
    runId: string;
    index: number;
    kind: RunOutputDeclaration['kind'];
    modelVersionId?: string;
    datasetVersionId?: string;
  },
): Promise<RunOutputDeclaration> {
  return (await first<RunOutputDeclaration>(
    connection,
    `INSERT INTO run_output_declarations(run_id,project_id,declaration_index,kind,model_version_id,dataset_version_id)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING ${declarationColumns}`,
    [
      record.runId,
      record.projectId,
      record.index,
      record.kind,
      record.modelVersionId ?? null,
      record.datasetVersionId ?? null,
    ],
  ))!;
}
