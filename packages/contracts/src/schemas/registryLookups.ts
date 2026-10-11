import { z } from 'zod';
import type {
  CodeVersionDetail,
  ModelFamilySummary,
  RuleMetricKeys,
} from '../registryLookups.js';
import { codeSchema, codeVersionSchema } from './registry.js';
import { namedContractSchema } from './schemaRegistry.js';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';

export const modelFamilySummarySchema = namedContractSchema(
  'ModelFamilySummary',
  z.strictObject({
    name: z.string(),
    modelCount: z.number().int(),
    codeVersionCount: z.number().int(),
  }),
);
export const codeVersionDetailSchema = namedContractSchema(
  'CodeVersionDetail',
  z.strictObject({
    code: codeSchema,
    version: codeVersionSchema,
  }),
);
export const ruleMetricKeysSchema = namedContractSchema(
  'RuleMetricKeys',
  z.strictObject({
    items: z.array(z.string()),
    source: z.enum(['rule_runs', 'code_version_runs', 'none']),
  }),
);

type _ModelFamilySummary = Expect<
  MutuallyAssignable<z.infer<typeof modelFamilySummarySchema>, ModelFamilySummary>
>;
type _CodeVersionDetail = Expect<
  MutuallyAssignable<z.infer<typeof codeVersionDetailSchema>, CodeVersionDetail>
>;
type _RuleMetricKeys = Expect<MutuallyAssignable<z.infer<typeof ruleMetricKeysSchema>, RuleMetricKeys>>;
