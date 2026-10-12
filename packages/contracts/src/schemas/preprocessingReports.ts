import type {
  PreprocessingReason,
  PreprocessingReport,
  PreprocessingReportResponse,
} from '../preprocessingReports.js';
import { z } from 'zod';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';
import {
  PREPROCESSING_METADATA_MAX_BYTES,
  PREPROCESSING_METADATA_MAX_DEPTH,
  PREPROCESSING_MAX_METRICS,
  PREPROCESSING_MAX_REASONS,
  PREPROCESSING_MAX_SAMPLES,
  PREPROCESSING_REASON_MAX_LENGTH,
  PREPROCESSING_MAX_METRIC_NAME_LENGTH,
  PREPROCESSING_METRIC_PREFIX,
} from '../preprocessingReports.js';
import { isJsonNestedDeeperThan } from './jsonNesting.js';
import { idSchema, jsonObjectSchema, timestampSchema } from './primitives.js';
import { namedContractSchema } from './schemaRegistry.js';

const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
// The depth is checked before the JSON validation, which recurses into every level.
const preprocessingMetadataSchema = z.preprocess(
  (metadata, context) => {
    if (isJsonNestedDeeperThan(metadata, PREPROCESSING_METADATA_MAX_DEPTH))
      context.addIssue({
        code: 'custom',
        message: `metadata may nest at most ${PREPROCESSING_METADATA_MAX_DEPTH} levels`,
      });
    return metadata;
  },
  jsonObjectSchema.refine(
    (metadata) =>
      new TextEncoder().encode(JSON.stringify(metadata)).length <= PREPROCESSING_METADATA_MAX_BYTES,
    `metadata may be at most ${PREPROCESSING_METADATA_MAX_BYTES} bytes of JSON`,
  ),
);
export const preprocessingReasonSchema = namedContractSchema(
  'PreprocessingReason',
  z.strictObject({
    reason: z.string().trim().min(1).max(PREPROCESSING_REASON_MAX_LENGTH),
    count: countSchema.positive(),
  }),
);
const reportFields = {
  inputCount: countSchema,
  outputCount: countSchema,
  excludedCount: countSchema,
  failedCount: countSchema,
  inputDurationSeconds: z.number().finite().nonnegative().nullable(),
  outputDurationSeconds: z.number().finite().nonnegative().nullable(),
  exclusions: z.array(preprocessingReasonSchema).max(PREPROCESSING_MAX_REASONS),
  failures: z.array(preprocessingReasonSchema).max(PREPROCESSING_MAX_REASONS),
  metrics: z
    .record(z.string().min(1).max(PREPROCESSING_MAX_METRIC_NAME_LENGTH), z.number().finite())
    .refine((metrics) => Object.keys(metrics).length <= PREPROCESSING_MAX_METRICS)
    .refine(
      (metrics) =>
        Object.keys(metrics).every((name) => !name.startsWith(PREPROCESSING_METRIC_PREFIX)),
      'preprocessing.* is reserved for report summary metrics',
    ),
  sampleArtifactIds: z
    .array(idSchema)
    .max(PREPROCESSING_MAX_SAMPLES)
    .refine((ids) => new Set(ids).size === ids.length),
  metadata: preprocessingMetadataSchema,
};
export const preprocessingReportInputSchema = namedContractSchema(
  'PreprocessingReportInput',
  z
    .strictObject({
      ...reportFields,
      inputDurationSeconds: reportFields.inputDurationSeconds.default(null),
      outputDurationSeconds: reportFields.outputDurationSeconds.default(null),
      exclusions: reportFields.exclusions.default([]),
      failures: reportFields.failures.default([]),
      metrics: reportFields.metrics.default({}),
      sampleArtifactIds: reportFields.sampleArtifactIds.default([]),
      metadata: reportFields.metadata.default({}),
    })
    .superRefine((report, context) => {
      if (report.excludedCount + report.failedCount > report.inputCount)
        context.addIssue({
          code: 'custom',
          path: ['excludedCount'],
          message: 'Excluded and failed counts exceed inputCount',
        });
      for (const [field, expected] of [
        ['exclusions', report.excludedCount],
        ['failures', report.failedCount],
      ] as const) {
        const reasons = report[field];
        if (reasons.reduce((total, reason) => total + reason.count, 0) !== expected)
          context.addIssue({
            code: 'custom',
            path: [field],
            message: 'Reason counts must match the total',
          });
      }
    }),
);
export const preprocessingReportSchema = namedContractSchema(
  'PreprocessingReport',
  z.strictObject({
    ...reportFields,
    runId: idSchema,
    projectId: idSchema,
    revision: z.number().int().positive(),
    updatedAt: timestampSchema,
  }),
);
export const preprocessingReportResponseSchema = namedContractSchema(
  'PreprocessingReportResponse',
  z.strictObject({ report: preprocessingReportSchema.nullable() }),
);

type _PreprocessingReason = Expect<
  MutuallyAssignable<z.infer<typeof preprocessingReasonSchema>, PreprocessingReason>
>;

type _PreprocessingReport = Expect<
  MutuallyAssignable<z.infer<typeof preprocessingReportSchema>, PreprocessingReport>
>;

type _PreprocessingReportResponse = Expect<
  MutuallyAssignable<z.infer<typeof preprocessingReportResponseSchema>, PreprocessingReportResponse>
>;
