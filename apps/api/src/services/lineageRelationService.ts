import type { LineageRelationAddition } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, transaction, type Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import type { LineageRelationCreateInput } from '../domain/lineageRelationValidation.js';
import { isTerminalStatus } from '../domain/runTransitions.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import { hasLineageAncestor, lockProjectLineage } from '../repositories/lineageMutationRepository.js';
import { lineageRelationColumns, listLineageRelations } from '../repositories/lineageRelationRepository.js';
import { assertProjectReference, findDatasetVersions, findRun } from '../repositories/registryRepository.js';
import { requireProject } from './accessService.js';
import { auditActor, recordDenial, type AuditEventDraft } from './auditService.js';
import { lockDatasetsOfVersions } from './datasetVersionReferences.js';

const TABLES = { run: 'runs', modelVersion: 'model_versions', datasetVersion: 'dataset_versions' } as const;

/** Adds verified historical relationships without rerunning work or changing recorded recipes. */
export class LineageRelationService {
  constructor(private readonly database: Database) {}

  async list(principal: Principal, projectId: string) {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    return { items: await listLineageRelations(this.database, projectId) };
  }

  async append(principal: Principal, registration: {
    projectId: string;
    input: LineageRelationCreateInput;
    request: RequestMetadata;
  }): Promise<LineageRelationAddition> {
    const { projectId, input, request } = registration;
    const draft: AuditEventDraft = {
      ...auditActor(principal), ...request, projectId,
      action: 'lineage.relation.append', resourceType: 'lineage_relation', resourceId: input.targetId,
      details: { sourceId: input.sourceId, targetId: input.targetId, relation: input.relation },
    };
    return recordDenial(this.database, draft, () => transaction(this.database, async (connection) => {
      await requireProject(connection, principal, { projectId, role: 'editor', scope: 'registry:write' });
      await requireProject(connection, principal, { projectId, role: 'editor', scope: 'runs:write' });
      await lockProjectLineage(connection, projectId);
      const endpoints = [
        { id: input.sourceId, kind: input.sourceKind },
        { id: input.targetId, kind: input.targetKind },
      ];
      await lockDatasetsOfVersions(connection, { projectId,
        versionIds: endpoints.filter((node) => node.kind === 'datasetVersion').map((node) => node.id),
      });
      for (const node of endpoints) {
        await assertProjectReference(connection, { projectId, table: TABLES[node.kind], id: node.id });
        if (node.kind === 'run') {
          const run = await findRun(connection, { projectId, id: node.id, lock: true });
          const lifecycle = await first<{ lifecycleStage: string }>(connection,
            'SELECT lifecycle_stage FROM runs WHERE project_id=$1 AND id=$2', [projectId, node.id]);
          if (!isTerminalStatus(run.status) || lifecycle?.lifecycleStage !== 'active')
            throw new DomainError(422, '終了済みの有効なRunだけ補完できます', 'lineage_run_not_terminal');
        }
      }
      const existing = await first<LineageRelationAddition>(connection,
        `SELECT ${lineageRelationColumns} FROM lineage_relation_additions
         WHERE project_id=$1 AND source_id=$2 AND target_id=$3 AND relation=$4`,
        [projectId, input.sourceId, input.targetId, input.relation]);
      if (existing) return existing;
      if (input.relation === 'output') {
        const [version] = await findDatasetVersions(connection, { projectId, ids: [input.targetId] });
        const previous = await first<{ sourceId: string }>(connection,
          "SELECT source_id FROM lineage_relation_additions WHERE project_id=$1 AND target_id=$2 AND relation='output'",
          [projectId, input.targetId]);
        if ([version!.sourceRunId, previous?.sourceId].some((id) => id && id !== input.sourceId))
          throw new DomainError(409, '別の生成元が記録されています', 'lineage_output_conflict');
      }
      // A reference records evidence, not causality, and is excluded from cycle checks.
      if (input.relation !== 'reference' && await hasLineageAncestor(connection, {
        projectId, ancestorId: input.targetId, descendantIds: [input.sourceId],
      })) throw new DomainError(422, '来歴が循環します', 'lineage_relation_cycle');
      const added = await first<LineageRelationAddition>(connection,
        `INSERT INTO lineage_relation_additions
         (project_id,source_id,source_kind,target_id,target_kind,relation,reason,evidence,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${lineageRelationColumns}`,
        [projectId, input.sourceId, input.sourceKind, input.targetId, input.targetKind, input.relation,
          input.reason, JSON.stringify(input.evidence), principal.user.id]);
      await writeAuditEvent(connection, { ...draft, resourceId: added!.id, outcome: 'success' });
      return added!;
    }));
  }
}
