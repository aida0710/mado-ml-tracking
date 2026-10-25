import type { RunDatasetUsage } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import type { Database } from '../db/database.js';
import { findRun } from '../repositories/registryRepository.js';
import { findOriginStepExecutionOfRun } from '../repositories/workflowExecutionRepository.js';
import { requireProject } from './accessService.js';

/**
 * Runが入力のデータセットバージョンをどう使ったか（役割、重み、選び方）。Runを始めた
 * ワークフローのstepが解決したとおりに返す。ワークフローが始めたのでないRunには無い。
 */
export class RunDatasetUsageService {
  constructor(private readonly database: Database) {}

  async get(principal: Principal, projectId: string, runId: string): Promise<RunDatasetUsage> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    await findRun(this.database, { projectId, id: runId });
    const step = await findOriginStepExecutionOfRun(this.database, { projectId, runId });
    return { items: step?.datasetUsage ?? [] };
  }
}
