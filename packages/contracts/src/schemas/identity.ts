import { z } from 'zod';
import { API_ERROR_CODES } from '../apiErrors.js';
import type {
  ApiErrorBody,
  AuthConfig,
  AuthMe,
  CurrentApiToken,
  Experiment,
  Project,
  TokenSummary,
  User,
} from '../index.js';
import { idSchema, projectRoleSchema, projectVisibilitySchema, timestampSchema } from './primitives.js';
import { namedContractSchema } from './schemaRegistry.js';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';

export const userSchema = namedContractSchema(
  'User',
  z.strictObject({
    id: idSchema,
    email: z.string(),
    displayName: z.string(),
    isAdmin: z.boolean(),
    username: z.string().nullable(),
    status: z.enum(['active', 'disabled']),
    authSources: z.array(z.enum(['local', 'oidc'])),
    kind: z.enum(['human', 'service', 'launcher']),
  }),
);
export const projectSchema = namedContractSchema(
  'Project',
  z.strictObject({
    id: idSchema,
    name: z.string(),
    description: z.string(),
    artifactBackend: z.string(),
    visibility: projectVisibilitySchema,
    role: projectRoleSchema,
    isMember: z.boolean(),
    createdAt: timestampSchema,
  }),
);
export const experimentSchema = namedContractSchema(
  'Experiment',
  z.strictObject({
    id: idSchema,
    projectId: idSchema,
    name: z.string(),
    description: z.string(),
    runCount: z.number().int(),
    createdAt: timestampSchema,
  }),
);
export const authConfigSchema = namedContractSchema(
  'AuthConfig',
  z.strictObject({
    mode: z.enum(['local', 'oidc', 'hybrid', 'development']),
    methods: z.strictObject({
      local: z.boolean(),
      oidc: z
        .strictObject({ label: z.string(), loginUrl: z.string(), managesGlobalRole: z.boolean() })
        .nullable(),
    }),
  }),
);
export const authMeSchema = namedContractSchema(
  'AuthMe',
  z.strictObject({ user: userSchema, mustChangePassword: z.boolean() }),
);
export const tokenSummarySchema = namedContractSchema(
  'TokenSummary',
  z.strictObject({
    id: idSchema,
    name: z.string(),
    kind: z.enum(['personal', 'service']),
    projectId: idSchema.nullable(),
    scopes: z.array(z.string()),
    expiresAt: timestampSchema.nullable(),
    lastUsedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    ownerType: z.enum(['user', 'service_account']),
    ownerId: idSchema,
    ownerName: z.string(),
    tokenPrefix: z.string(),
  }),
);
export const currentApiTokenSchema = namedContractSchema(
  'CurrentApiToken',
  z.strictObject({
    id: idSchema,
    projectId: idSchema.nullable(),
    scopes: z.array(z.string()),
    job: z.boolean(),
  }),
);
/**
 * POST /tokensとPOST /projects/:p/service-accounts/:id/tokens: secretはこの応答でだけ表示する。
 * APIの`IssuedToken`（tokenService.ts）は、そのファイルでこのスキーマと照合している。
 */
export const issuedTokenSchema = namedContractSchema(
  'IssuedToken',
  z.strictObject({ token: z.string(), item: tokenSummarySchema }),
);
/** 独自 API のエラー応答の本文。code ごとに、文に入る値を横の項目として足す。 */
export const apiErrorSchema = namedContractSchema(
  'ApiErrorBody',
  z.looseObject({
    error: z.string(),
    code: z.enum(API_ERROR_CODES),
  }),
);

type _User = Expect<MutuallyAssignable<z.infer<typeof userSchema>, User>>;
type _Project = Expect<MutuallyAssignable<z.infer<typeof projectSchema>, Project>>;
type _Experiment = Expect<MutuallyAssignable<z.infer<typeof experimentSchema>, Experiment>>;
type _AuthConfig = Expect<MutuallyAssignable<z.infer<typeof authConfigSchema>, AuthConfig>>;
type _AuthMe = Expect<MutuallyAssignable<z.infer<typeof authMeSchema>, AuthMe>>;
type _TokenSummary = Expect<MutuallyAssignable<z.infer<typeof tokenSummarySchema>, TokenSummary>>;
type _CurrentApiToken = Expect<
  MutuallyAssignable<z.infer<typeof currentApiTokenSchema>, CurrentApiToken>
>;
type _ApiErrorBody = Expect<MutuallyAssignable<z.infer<typeof apiErrorSchema>, ApiErrorBody>>;
