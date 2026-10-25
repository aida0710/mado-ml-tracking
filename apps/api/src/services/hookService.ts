import { randomBytes, randomUUID } from 'node:crypto';
import {
  HOOK_PAYLOAD_MAX_BYTES,
  hookWebhookPath,
  type Hook,
  type HookCreated,
  type HookExecution,
  type HookExecutionPage,
  type HookOwnerTransfer,
  type JsonObject,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import type { ApiConfig } from '../config.js';
import { transaction, type Connection, type Database } from '../db/database.js';
import { validateCodeCompatibility } from '../domain/compatibility.js';
import { DomainError, notFound } from '../domain/errors.js';
import {
  validateHookSettings,
  type HookCreateInput,
  type HookExecutionQuery,
} from '../domain/hookValidation.js';
import { assertNoReservedRunTags } from '../domain/reservedRunTags.js';
import { verifyWebhookSignature, WEBHOOK_HEADERS } from '../domain/webhookSignature.js';
import {
  findHook,
  findHookExecution,
  findWebhookSecret,
  hookExecutionExists,
  insertHook,
  listHookExecutions,
  listHooks,
  lockHook,
  updateHookOwner,
} from '../repositories/hookRepository.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import { findServiceAccount } from '../repositories/serviceAccountRepository.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import {
  assertProjectReference,
  findCodeVersion,
  findModelVersion,
} from '../repositories/registryRepository.js';
import { validateCodeArtifacts } from '../repositories/runtimeArtifactRepository.js';
import { decryptSecret, encryptSecret } from '../security/secretEncryption.js';
import { requireProject } from './accessService.js';
import { auditActor, recordDenial, type AuditEventDraft } from './auditService.js';
import { assertInputDatasetVersionsUsable } from './datasetVersionReferences.js';
import type { HookDispatcher } from './hookDispatcher.js';
import { assertPartitionVersion } from './jobArrayService.js';
import type { JobService } from './jobService.js';

// 32 random bytes, the length GitHub recommends for webhook secrets.
const WEBHOOK_SECRET_BYTES = 32;
// Starting a hook needs an editor (hasHookOwnerAccess), so its owner must be one too.
const HOOK_OWNER_ROLES = ['editor', 'admin'];

function webhookSecretContext(hookId: string): string {
  return `hook-webhook:${hookId}`;
}

function payloadTooLarge(): never {
  throw new DomainError({
    status: 413,
    code: 'body_too_large',
    message: `payload can be at most ${HOOK_PAYLOAD_MAX_BYTES} bytes`,
    details: { maxBytes: HOOK_PAYLOAD_MAX_BYTES },
  });
}

// A JSON object reaches the Job as it was sent; anything else is kept as text under `body`.
function webhookPayload(body: Buffer): JsonObject {
  const text = body.toString('utf8');
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as JsonObject;
  } catch {
    // Form-encoded or plain bodies are not JSON.
  }
  return { body: text };
}

/**
 * Hooks of a Project (docs/hooks.md): settings fixed at creation except enabled and the owner,
 * the manual trigger, signed webhooks and the execution history. The starts themselves are
 * HookDispatcher's.
 */
export class HookService {
  private readonly database: Database;
  private readonly dispatcher: HookDispatcher;
  private readonly jobs: JobService;
  private readonly config: ApiConfig;
  private readonly clock: () => Date;
  constructor(options: {
    database: Database;
    dispatcher: HookDispatcher;
    jobs: JobService;
    config: ApiConfig;
    clock?: () => Date;
  }) {
    this.database = options.database;
    this.dispatcher = options.dispatcher;
    this.jobs = options.jobs;
    this.config = options.config;
    this.clock = options.clock ?? (() => new Date());
  }

  async list(principal: Principal, projectId: string): Promise<Hook[]> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    return listHooks(this.database, projectId);
  }

  /** The hook runs as its creator, who must stay an editor of the Project for it to start. */
  async create(principal: Principal, projectId: string, input: HookCreateInput): Promise<HookCreated> {
    validateHookSettings(input);
    // Template tags are copied onto every Run the hook starts, so they obey the Run tag rule.
    assertNoReservedRunTags(input.template.tags);
    const secretKey = this.config.hookSecretKey;
    if (input.trigger === 'webhook' && !secretKey)
      throw new DomainError({
        status: 422,
        code: 'hook_secret_key_missing',
        message: 'a webhook hook requires MMT_HOOK_SECRET_KEY to be set',
      });
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'jobs:write',
      });
      await this.validateTemplate(connection, { projectId, input, userId: principal.user.id });
      const id = randomUUID();
      const webhookSecret =
        input.trigger === 'webhook' ? randomBytes(WEBHOOK_SECRET_BYTES).toString('base64url') : null;
      await insertHook(connection, {
        id,
        projectId,
        name: input.name,
        trigger: input.trigger,
        filter: input.filter,
        template: input.template,
        checkpointMode: input.checkpointMode,
        checkpointEvery: input.checkpointEvery,
        concurrency: input.concurrency,
        maxStartsPerHour: input.maxStartsPerHour,
        webhookSignature: input.webhookSignature ?? null,
        createdBy: principal.user.id,
        runAsUserId: principal.user.id,
        webhookSecret: webhookSecret
          ? encryptSecret({
              key: secretKey!,
              plaintext: webhookSecret,
              context: webhookSecretContext(id),
            })
          : null,
      });
      return {
        hook: (await findHook(connection, { projectId, id }))!,
        webhookSecret,
        webhookPath: webhookSecret ? hookWebhookPath(id) : null,
      };
    });
  }

  async toggle(
    principal: Principal,
    projectId: string,
    toggle: { hookId: string; enabled: boolean },
  ): Promise<Hook> {
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'jobs:write',
      });
      const updated = await connection.query(
        'UPDATE hooks SET enabled=$3 WHERE id=$1 AND project_id=$2',
        [toggle.hookId, projectId, toggle.enabled],
      );
      if (!updated.rowCount) notFound('hook');
      return (await findHook(connection, { projectId, id: toggle.hookId }))!;
    });
  }

  /**
   * Moves the user a hook runs as to a Service Account of the same Project, so the hook keeps
   * starting when its creator leaves. Like an automation rule's owner, only a Project admin may
   * move it; the account must be active and an editor or admin. created_by keeps the creator.
   * Setting the same owner again changes nothing and is not audited again.
   */
  async transferOwner(
    principal: Principal,
    projectId: string,
    transfer: { hookId: string; input: HookOwnerTransfer; metadata: RequestMetadata },
  ): Promise<Hook> {
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...transfer.metadata,
      action: 'hook.owner.transfer',
      resourceType: 'hook',
      resourceId: transfer.hookId,
      projectId,
      details: { serviceAccountId: transfer.input.serviceAccountId },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        // Global administrators still obey token scope, project restrictions and membership.
        await requireProject(connection, principal, {
          projectId,
          role: principal.user.isAdmin ? 'viewer' : 'admin',
          scope: 'admin',
        });
        const hook = await lockHook(connection, { projectId, id: transfer.hookId, mode: 'update' });
        if (!hook) notFound('hook');
        const serviceAccountId = transfer.input.serviceAccountId;
        const account = await findServiceAccount(connection, { projectId, serviceAccountId });
        if (!account || account.status !== 'active' || !HOOK_OWNER_ROLES.includes(account.role ?? ''))
          throw new DomainError({
            status: 422,
            code: 'invalid_hook_owner',
            message: 'the new owner must be an active service account of the same project (role editor or admin)',
          });
        if (hook.runAsUserId !== serviceAccountId) {
          await updateHookOwner(connection, { hookId: hook.id, runAsUserId: serviceAccountId });
          await writeAuditEvent(connection, {
            ...draft,
            outcome: 'success',
            details: { ...draft.details, previousRunAsUserId: hook.runAsUserId },
          });
        }
        return (await findHook(connection, { projectId, id: hook.id }))!;
      }),
    );
  }

  async trigger(
    principal: Principal,
    projectId: string,
    request: { hookId: string; payload?: JsonObject; idempotencyKey?: string },
  ): Promise<HookExecution> {
    const payload = request.payload ?? {};
    if (Buffer.byteLength(JSON.stringify(payload)) > HOOK_PAYLOAD_MAX_BYTES) payloadTooLarge();
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'jobs:write',
      });
      const hook = await lockHook(connection, { projectId, id: request.hookId });
      if (!hook) notFound('hook');
      if (hook.trigger !== 'manual')
        throw new DomainError({
          status: 422,
          code: 'hook_not_manual',
          message: 'only hooks whose trigger is manual can be started by hand',
        });
      if (!hook.enabled) throw new DomainError({
        status: 409,
        code: 'hook_disabled',
        message: 'the hook is disabled',
      });
      const id = await this.dispatcher.dispatchRequest(connection, {
        hook,
        subjectKind: 'manual',
        eventKey: `manual:${request.idempotencyKey ?? randomUUID()}`,
        payload,
        requestedBy: principal.user.id,
      });
      return (await findHookExecution(connection, { projectId, id }))!;
    });
  }

  async executions(
    principal: Principal,
    projectId: string,
    query: HookExecutionQuery,
  ): Promise<HookExecutionPage> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    if (query.cursor && !(await hookExecutionExists(this.database, { projectId, id: query.cursor })))
      notFound('hook execution cursor');
    const page = await listHookExecutions(this.database, {
      projectId,
      hookId: query.hookId,
      limit: query.limit + 1,
      cursor: query.cursor,
    });
    const items = page.slice(0, query.limit);
    return { items, nextCursor: page.length > query.limit ? items.at(-1)!.id : null };
  }

  /**
   * A delivery from outside (GitHub, CI, another service). The signature is the only check, so
   * the hook's state is told only to a caller that holds the secret.
   */
  async receiveWebhook(delivery: {
    hookId: string;
    header: (name: string) => string | undefined;
    body: Buffer;
  }): Promise<{ accepted: true; executionId: string }> {
    const stored = await findWebhookSecret(this.database, delivery.hookId);
    if (!stored?.signature) notFound('hook');
    const key = this.config.hookSecretKey;
    if (!key)
      throw new DomainError({
        status: 503,
        code: 'hook_secret_key_missing',
        message: 'MMT_HOOK_SECRET_KEY is not set',
      });
    let secret: string;
    try {
      secret = decryptSecret({
        key,
        encrypted: stored.secret,
        context: webhookSecretContext(delivery.hookId),
      });
    } catch {
      throw new DomainError({
        status: 503,
        code: 'hook_secret_key_missing',
        message: 'cannot read the webhook secret (the key is different)',
      });
    }
    if (delivery.body.length > HOOK_PAYLOAD_MAX_BYTES) payloadTooLarge();
    const headers = WEBHOOK_HEADERS[stored.signature];
    const verified = verifyWebhookSignature({
      style: stored.signature,
      secret,
      header: delivery.header(headers.signature),
      body: delivery.body,
      nowSeconds: Math.floor(this.clock().getTime() / 1000),
    });
    if (!verified) throw new DomainError({
      status: 401,
      code: 'invalid_signature',
      message: 'the signature does not match',
    });
    if (!stored.enabled) throw new DomainError({
      status: 409,
      code: 'hook_disabled',
      message: 'the hook is disabled',
    });
    const deliveryId = delivery.header(headers.delivery)?.trim().slice(0, 200);
    return transaction(this.database, async (connection) => {
      const hook = await lockHook(connection, { projectId: stored.projectId, id: delivery.hookId });
      if (!hook) notFound('hook');
      const executionId = await this.dispatcher.dispatchRequest(connection, {
        hook,
        subjectKind: 'webhook',
        // Without a delivery ID every request is its own event.
        eventKey: `webhook:${deliveryId || randomUUID()}`,
        payload: webhookPayload(delivery.body),
        requestedBy: null,
      });
      return { accepted: true as const, executionId };
    });
  }

  // Checks what each start would check, so a hook that can never start fails at creation.
  private async validateTemplate(
    connection: Connection,
    // userId: the hook's creator, whom it runs as.
    creation: { projectId: string; input: HookCreateInput; userId: string },
  ): Promise<void> {
    const { projectId, input } = creation;
    const { template } = input;
    await assertProjectReference(connection, {
      table: 'experiments',
      projectId,
      id: template.experimentId,
    });
    await assertInputDatasetVersionsUsable(connection, {
      projectId,
      ids: template.inputDatasetVersionIds,
    });
    const code = await findCodeVersion(connection, { projectId, id: template.codeVersionId });
    const model = template.modelVersionId
      ? await findModelVersion(connection, { projectId, id: template.modelVersionId })
      : null;
    validateCodeCompatibility(code, { model, kind: template.kind });
    for (const family of input.filter.modelFamilies ?? [])
      validateCodeCompatibility(code, { model: { family }, kind: template.kind });
    await validateCodeArtifacts(connection, code);
    const target = await this.jobs.validateTarget(connection, {
      targetId: template.targetId,
      gpuIds: template.gpuIds,
      gpuCount: template.gpuCount,
      retryOnFailure: template.retryOnFailure,
      retryOnTimeout: template.retryOnTimeout,
      runtime: code.runtime,
      usage: { userId: creation.userId },
    });
    if (template.arraySize !== null && target.executor !== 'site')
      throw new DomainError({
        status: 422,
        code: 'site_target_required',
        message: 'arrays can run only on sites',
      });
    if (template.datasetPartitionVersionId)
      await assertPartitionVersion(connection, {
        projectId,
        partitionId: template.datasetPartitionVersionId,
        inputIds: template.inputDatasetVersionIds,
      });
  }
}
