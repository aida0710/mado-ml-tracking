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

// What every declaration of one request shares: the Job's Run and its Task output setting.
interface DeclarationContext {
  projectId: string;
  run: Run;
  taskOutputModel: TaskOutputModel | null;
  // Resolved on the first model declaration; createModel may insert the Model.
  taskModelId?: string | null;
}

const declarationColumns =
  'declaration_index AS index,kind,model_version_id,dataset_version_id,created_at';

/**
 * Registers the outputs a container declared in result.json version 2, as the Run's creator.
 * The caller has verified the worker's lease and holds the Job row, so one Job's requests run
 * one at a time. Registered versions start automation now; for a Run that is still running the
 * automation waits as pending and is released or skipped when the Run ends.
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
  // Pin the Artifact manifest so later workers can fetch the exact files through the dataset API.
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
 * The files of a dataset declared by `path`: the saved output file at that path, or, when the
 * path is a directory, every saved output under it with paths relative to that directory.
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
  // The listing stops at MAX_DATASET_VERSION_FILES, like a version made from a Run's Artifacts.
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
  // A same-named Model may have been created with another family after the Task was saved.
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
  // MLflow soft-deleted Models keep their row; registering would revive a Model the user removed.
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
