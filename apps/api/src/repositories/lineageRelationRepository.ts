import type { LineageRelationAddition } from '@mmt/contracts';
import { rows, type Connection } from '../db/database.js';

// Generated foreign-key columns protect each endpoint but are not API fields.
export const lineageRelationColumns = `id,project_id,source_id,source_kind,target_id,target_kind,
  relation,reason,evidence,created_by,created_at`;

export function listLineageRelations(connection: Connection, projectId: string) {
  return rows<LineageRelationAddition>(connection,
    `SELECT ${lineageRelationColumns} FROM lineage_relation_additions
     WHERE project_id=$1 ORDER BY created_at,id`, [projectId]);
}
