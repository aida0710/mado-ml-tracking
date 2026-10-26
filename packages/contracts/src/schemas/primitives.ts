import { z } from 'zod';
import type {
  JobStatus,
  JsonObject,
  JsonValue,
  LatestMetricValue,
  ProjectRole,
  ProjectVisibility,
  RunKind,
  RunStatus,
} from '../index.js';
import { namedContractSchema } from './schemaRegistry.js';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';

// 8-4-4-4-12の16進のIDなら何でもよい。fixtureや取り込んだ行は、RFC 4122のvariantとは限らない。
export const idSchema = z.guid();
// タイムスタンプは、Date.toISOString()によるISO 8601の文字列としてAPIから出ていく。
export const timestampSchema = z.iso.datetime({ offset: true });
export const jsonValueSchema = namedContractSchema('JsonValue', z.json());
export const jsonObjectSchema = namedContractSchema(
  'JsonObject',
  z.record(z.string(), jsonValueSchema),
);
export const stringMapSchema = z.record(z.string(), z.string());
export const latestMetricValueSchema = z.union([z.number(), z.enum(['NaN', 'Infinity', '-Infinity'])]);
export const projectRoleSchema = z.enum(['viewer', 'editor', 'admin']);
export const projectVisibilitySchema = z.enum(['public', 'private']);
export const runKindSchema = z.enum([
  'inference',
  'evaluation',
  'training',
  'finetuning',
  'processing',
]);
export const runStatusSchema = z.enum(['queued', 'running', 'finished', 'failed', 'canceled']);
export const jobStatusSchema = z.enum([...runStatusSchema.options, 'claimed']);

/** `{items: T[]}`: ページ分けしない一覧の応答に共通の形。 */
export function itemsOf<T extends z.ZodType>(item: T) {
  return z.strictObject({ items: z.array(item) });
}

/** keysetでページ分けしたページ。最後のページは`nextCursor: null`。 */
export function cursorPageOf<T extends z.ZodType>(item: T) {
  return z.strictObject({ items: z.array(item), nextCursor: z.string().nullable() });
}

type _JsonValue = Expect<MutuallyAssignable<z.infer<typeof jsonValueSchema>, JsonValue>>;
type _JsonObject = Expect<MutuallyAssignable<z.infer<typeof jsonObjectSchema>, JsonObject>>;
type _LatestMetricValue = Expect<
  MutuallyAssignable<z.infer<typeof latestMetricValueSchema>, LatestMetricValue>
>;
type _ProjectRole = Expect<MutuallyAssignable<z.infer<typeof projectRoleSchema>, ProjectRole>>;
type _ProjectVisibility = Expect<
  MutuallyAssignable<z.infer<typeof projectVisibilitySchema>, ProjectVisibility>
>;
type _RunKind = Expect<MutuallyAssignable<z.infer<typeof runKindSchema>, RunKind>>;
type _RunStatus = Expect<MutuallyAssignable<z.infer<typeof runStatusSchema>, RunStatus>>;
type _JobStatus = Expect<MutuallyAssignable<z.infer<typeof jobStatusSchema>, JobStatus>>;
