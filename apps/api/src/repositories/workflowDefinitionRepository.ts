import type { Workflow, WorkflowStep, WorkflowVersion } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import { notFound } from '../domain/errors.js';

export async function findWorkflow(
  connection: Connection,
  reference: { projectId: string; id: string; lock?: boolean },
): Promise<Workflow> {
  const workflow = await first<Workflow>(
    connection,
    `SELECT * FROM workflows WHERE project_id=$1 AND id=$2 ${reference.lock ? 'FOR UPDATE' : ''}`,
    [reference.projectId, reference.id],
  );
  if (!workflow) notFound('Workflow');
  return workflow;
}

export async function findWorkflowVersion(
  connection: Connection,
  reference: { projectId: string; workflowId: string; revision: number },
): Promise<WorkflowVersion> {
  const version = await first<WorkflowVersion>(
    connection,
    'SELECT * FROM workflow_versions WHERE project_id=$1 AND workflow_id=$2 AND revision=$3',
    [reference.projectId, reference.workflowId, reference.revision],
  );
  if (!version) notFound('WorkflowVersion');
  return version;
}

export async function listWorkflowVersions(
  connection: Connection,
  reference: { projectId: string; workflowId: string },
): Promise<WorkflowVersion[]> {
  return rows(
    connection,
    'SELECT * FROM workflow_versions WHERE project_id=$1 AND workflow_id=$2 ORDER BY revision DESC',
    [reference.projectId, reference.workflowId],
  );
}

export async function insertWorkflowVersion(
  connection: Connection,
  registration: { workflow: Workflow; steps: WorkflowStep[]; createdBy: string; revision: number },
): Promise<WorkflowVersion> {
  const { workflow, steps } = registration;
  const version = (await first<WorkflowVersion>(
    connection,
    `INSERT INTO workflow_versions(workflow_id,project_id,revision,steps,created_by)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [
      workflow.id,
      workflow.projectId,
      registration.revision,
      JSON.stringify(steps),
      registration.createdBy,
    ],
  ))!;
  const fixedInputIds = [
    ...new Set(
      steps.flatMap((step) =>
        step.inputs.flatMap((binding) =>
          binding.source.kind === 'dataset' ? [binding.source.datasetVersionId] : [],
        ),
      ),
    ),
  ];
  await connection.query(
    `INSERT INTO workflow_version_inputs(workflow_version_id,project_id,dataset_version_id)
    SELECT $1,$2,id FROM unnest($3::uuid[]) AS id`,
    [version.id, workflow.projectId, fixedInputIds],
  );
  await connection.query('UPDATE workflows SET latest_revision=$2 WHERE id=$1', [
    workflow.id,
    registration.revision,
  ]);
  return version;
}
