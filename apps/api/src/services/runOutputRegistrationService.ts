import type { RunOutputRegistration } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import type { Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import { findRun } from '../repositories/registryRepository.js';
import { findRunOutputRegistration } from '../repositories/runOutputRegistrationRepository.js';
import { requireProject } from './accessService.js';

export class RunOutputRegistrationService {
  constructor(private readonly database: Database) {}

  // 記録の無いRunは、Taskの出力の設定が無いか、まだ終わっていないかのどちらか。Run自身の
  // outputModelRegistrationで見分ける。
  async get(
    principal: Principal,
    reference: { projectId: string; runId: string },
  ): Promise<RunOutputRegistration> {
    const { projectId, runId } = reference;
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    await findRun(this.database, { projectId, id: runId });
    const registration = await findRunOutputRegistration(this.database, { projectId, runId });
    if (!registration)
      throw new DomainError({
        status: 404,
        code: 'output_registration_not_found',
        message: 'there is no record of output model registration by the task',
      });
    return registration;
  }
}
