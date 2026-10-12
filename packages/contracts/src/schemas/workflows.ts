import type {
  WorkflowDatasetBinding,
  WorkflowQualityGate,
  WorkflowStepInput,
  WorkflowStep,
  Workflow,
  WorkflowVersion,
  WorkflowDetail,
  WorkflowVersionPage,
  WorkflowStepExecution,
  WorkflowExecutionSummary,
  WorkflowExecution,
  WorkflowExecutionPage,
} from '../workflows.js';
import { z } from 'zod';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';
import {
  WORKFLOW_MAX_INPUTS,
  WORKFLOW_MAX_QUALITY_GATES,
  WORKFLOW_MAX_STEPS,
  WORKFLOW_MAX_REVISION,
  WORKFLOW_MAX_NAME_LENGTH,
  WORKFLOW_MAX_STEP_KEY_LENGTH,
  WORKFLOW_MAX_DESCRIPTION_LENGTH,
  WORKFLOW_MAX_IDEMPOTENCY_KEY_LENGTH,
  WORKFLOW_MAX_METRIC_NAME_LENGTH,
} from '../workflows.js';
import { datasetUsageRoleSchema, datasetUsageSchema } from './datasetUsage.js';
import { experimentTaskSchema } from './experimentTasks.js';
import { idSchema, jsonObjectSchema, timestampSchema, cursorPageOf } from './primitives.js';
import { preprocessingReportSchema } from './preprocessingReports.js';
import { namedContractSchema } from './schemaRegistry.js';

const workflowStepKeySchema = z.string().trim().min(1).max(WORKFLOW_MAX_STEP_KEY_LENGTH);
const workflowNameSchema = z.string().trim().min(1).max(WORKFLOW_MAX_NAME_LENGTH);
const workflowRevisionSchema = z.number().int().positive().max(WORKFLOW_MAX_REVISION);
export const workflowDatasetBindingSchema = namedContractSchema(
  'WorkflowDatasetBinding',
  z.strictObject({
    source: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('dataset'), datasetVersionId: idSchema }),
      z.strictObject({
        kind: z.literal('step'),
        stepKey: workflowStepKeySchema,
        datasetName: workflowNameSchema.nullable(),
      }),
    ]),
    role: datasetUsageRoleSchema,
    weight: z.number().finite().positive(),
    selection: jsonObjectSchema,
  }),
);
export const workflowQualityGateSchema = namedContractSchema(
  'WorkflowQualityGate',
  z.strictObject({
    metric: z.string().trim().min(1).max(WORKFLOW_MAX_METRIC_NAME_LENGTH),
    operator: z.enum(['gte', 'lte', 'eq']),
    threshold: z.number().finite(),
  }),
);
const workflowStepFields = {
  key: workflowStepKeySchema,
  name: workflowNameSchema,
  inputs: z.array(workflowDatasetBindingSchema).max(WORKFLOW_MAX_INPUTS),
  modelFromStepKey: workflowStepKeySchema.nullable(),
  qualityGates: z.array(workflowQualityGateSchema).max(WORKFLOW_MAX_QUALITY_GATES),
};
export const workflowStepInputSchema = namedContractSchema(
  'WorkflowStepInput',
  z.strictObject({
    ...workflowStepFields,
    taskId: idSchema,
    expectedTaskRevision: workflowRevisionSchema,
  }),
);
export const workflowStepSchema = namedContractSchema(
  'WorkflowStep',
  z.strictObject({
    ...workflowStepFields,
    task: experimentTaskSchema,
  }),
);
const workflowStepsInputSchema = z.array(workflowStepInputSchema).min(1).max(WORKFLOW_MAX_STEPS);
export const workflowCreateSchema = namedContractSchema(
  'WorkflowCreate',
  z.strictObject({
    name: workflowNameSchema,
    description: z.string().max(WORKFLOW_MAX_DESCRIPTION_LENGTH).default(''),
    steps: workflowStepsInputSchema,
  }),
);
export const workflowVersionCreateSchema = namedContractSchema(
  'WorkflowVersionCreate',
  z.strictObject({
    expectedRevision: workflowRevisionSchema,
    steps: workflowStepsInputSchema,
  }),
);
export const workflowLaunchSchema = namedContractSchema(
  'WorkflowLaunch',
  z.strictObject({
    revision: workflowRevisionSchema,
    idempotencyKey: z.string().trim().min(1).max(WORKFLOW_MAX_IDEMPOTENCY_KEY_LENGTH),
    resumeFromExecutionId: idSchema.optional(),
  }),
);
export const workflowSchema = namedContractSchema(
  'Workflow',
  z.strictObject({
    id: idSchema,
    projectId: idSchema,
    name: workflowNameSchema,
    description: z.string(),
    latestRevision: workflowRevisionSchema,
    createdBy: idSchema,
    createdAt: timestampSchema,
  }),
);
export const workflowVersionSchema = namedContractSchema(
  'WorkflowVersion',
  z.strictObject({
    id: idSchema,
    projectId: idSchema,
    workflowId: idSchema,
    revision: workflowRevisionSchema,
    steps: z.array(workflowStepSchema),
    createdBy: idSchema,
    createdAt: timestampSchema,
  }),
);
export const workflowDetailSchema = namedContractSchema(
  'WorkflowDetail',
  z.strictObject({
    workflow: workflowSchema,
    versions: z.array(workflowVersionSchema),
    olderVersionsCursor: z.string().nullable(),
  }),
);
export const workflowVersionPageSchema = namedContractSchema(
  'WorkflowVersionPage',
  cursorPageOf(workflowVersionSchema),
);
export const workflowStepExecutionSchema = namedContractSchema(
  'WorkflowStepExecution',
  z.strictObject({
    id: idSchema,
    stepIndex: z.number().int().nonnegative(),
    stepKey: workflowStepKeySchema,
    name: workflowNameSchema,
    status: z.enum(['pending', 'queued', 'running', 'finished', 'failed', 'canceled']),
    runId: idSchema.nullable(),
    jobId: idSchema.nullable(),
    reused: z.boolean(),
    datasetUsage: z.array(datasetUsageSchema),
    outputDatasetVersionIds: z.array(idSchema),
    outputModelVersionIds: z.array(idSchema),
    metrics: z.record(z.string(), z.number()),
    error: z.string().nullable(),
    endedAt: timestampSchema.nullable(),
    preprocessingReport: preprocessingReportSchema.nullable(),
  }),
);
const workflowExecutionFields = {
  id: idSchema,
  projectId: idSchema,
  workflowId: idSchema,
  workflowVersionId: idSchema,
  revision: workflowRevisionSchema,
  status: z.enum(['running', 'canceling', 'finished', 'failed', 'canceled']),
  createdBy: idSchema,
  createdAt: timestampSchema,
  endedAt: timestampSchema.nullable(),
  error: z.string().nullable(),
  resumeFromExecutionId: idSchema.nullable(),
};
export const workflowExecutionSummarySchema = namedContractSchema(
  'WorkflowExecutionSummary',
  z.strictObject(workflowExecutionFields),
);
export const workflowExecutionSchema = namedContractSchema(
  'WorkflowExecution',
  z.strictObject({ ...workflowExecutionFields, steps: z.array(workflowStepExecutionSchema) }),
);
export const workflowExecutionPageSchema = namedContractSchema(
  'WorkflowExecutionPage',
  cursorPageOf(workflowExecutionSummarySchema),
);

type _WorkflowDatasetBinding = Expect<
  MutuallyAssignable<z.infer<typeof workflowDatasetBindingSchema>, WorkflowDatasetBinding>
>;

type _WorkflowQualityGate = Expect<
  MutuallyAssignable<z.infer<typeof workflowQualityGateSchema>, WorkflowQualityGate>
>;

type _WorkflowStepInput = Expect<
  MutuallyAssignable<z.infer<typeof workflowStepInputSchema>, WorkflowStepInput>
>;

type _WorkflowStep = Expect<MutuallyAssignable<z.infer<typeof workflowStepSchema>, WorkflowStep>>;

type _Workflow = Expect<MutuallyAssignable<z.infer<typeof workflowSchema>, Workflow>>;

type _WorkflowVersion = Expect<
  MutuallyAssignable<z.infer<typeof workflowVersionSchema>, WorkflowVersion>
>;

type _WorkflowDetail = Expect<
  MutuallyAssignable<z.infer<typeof workflowDetailSchema>, WorkflowDetail>
>;

type _WorkflowVersionPage = Expect<
  MutuallyAssignable<z.infer<typeof workflowVersionPageSchema>, WorkflowVersionPage>
>;

type _WorkflowStepExecution = Expect<
  MutuallyAssignable<z.infer<typeof workflowStepExecutionSchema>, WorkflowStepExecution>
>;

type _WorkflowExecutionSummary = Expect<
  MutuallyAssignable<z.infer<typeof workflowExecutionSummarySchema>, WorkflowExecutionSummary>
>;

type _WorkflowExecution = Expect<
  MutuallyAssignable<z.infer<typeof workflowExecutionSchema>, WorkflowExecution>
>;

type _WorkflowExecutionPage = Expect<
  MutuallyAssignable<z.infer<typeof workflowExecutionPageSchema>, WorkflowExecutionPage>
>;
