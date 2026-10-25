import { rows, type Database } from '../../db/database.js';
import {
  registeredModelSelect,
  modelVersionSelect,
  activeModelVersionsByModel,
} from './modelRepository.js';
import { registeredModelProtocol, modelVersionProtocol } from './protocol.js';
import {
  compileFilter,
  splitSearchField,
  SqlParameters,
  type SearchField,
  timestampInMillisecondsSql,
} from './searchSyntax.js';
import { cutPage, requestedPage, type SearchPage } from './searchPagination.js';
import { invalidParameter, type SearchRegistry } from './validation.js';
import type { ModelVersionRecord, RegisteredModelRecord } from './types.js';

const registeredModelUpdatedAt: SearchField = {
  expression: timestampInMillisecondsSql('COALESCE(mm.updated_at,m.created_at)'),
  numeric: true,
};
const registeredModelFields: Record<string, SearchField> = {
  name: { expression: 'm.name', numeric: false },
  creation_timestamp: {
    expression: timestampInMillisecondsSql('m.created_at'),
    numeric: true,
  },
  last_updated_timestamp: registeredModelUpdatedAt,
  // MLflow's recommended order key for registered models; it sorts by the last update.
  timestamp: registeredModelUpdatedAt,
};
// Versions that are not plain digits never match a numeric comparison.
const versionNumberField: SearchField = {
  expression: "CASE WHEN v.version ~ '^[0-9]+$' THEN v.version::numeric END",
  numeric: true,
  acceptsQuotedInteger: true,
};
const modelVersionFields: Record<string, SearchField> = {
  name: { expression: 'm.name', numeric: false, acceptsInList: true },
  version_number: versionNumberField,
  run_id: { expression: 'v.source_run_id::text', numeric: false, acceptsInList: true },
  model_id: { expression: 'vm.logged_model_id', numeric: false, acceptsInList: true },
  source_path: { expression: 'vm.artifact_uri', numeric: false, acceptsInList: true },
  creation_timestamp: {
    expression: timestampInMillisecondsSql('v.created_at'),
    numeric: true,
  },
  last_updated_timestamp: {
    expression: timestampInMillisecondsSql('COALESCE(vm.updated_at,v.created_at)'),
    numeric: true,
  },
};
// MLflow's registry search accepts the attribute., tag. and tags. prefixes (SearchModelUtils,
// SearchModelVersionUtils).
const REGISTRY_FIELD_KINDS: Record<string, 'attribute' | 'tag'> = {
  attribute: 'attribute',
  tag: 'tag',
  tags: 'tag',
};
// MLflow 3 clients append tag.`mlflow.prompt.is_prompt` != 'true' to every registered model
// search, and MLflow reads a model without this tag as not a prompt. Comparing a missing tag as
// 'false' keeps plain models in those results; this API has no Prompt Registry entries to exclude.
const PROMPT_TAG_KEY = 'mlflow.prompt.is_prompt';
const MISSING_PROMPT_TAG_VALUE = 'false';

/** The filter, order and page of one registry search, ready to follow a WHERE clause. */
function registrySearch(
  input: SearchRegistry,
  reference: { projectId: string; kind: 'model' | 'version' },
): { parameters: SqlParameters; page: SearchPage; filteredPageSql: string } {
  const page = requestedPage({
    query: { ...reference, filter: input.filter, order_by: input.order_by },
    pageToken: input.page_token,
    maxResults: input.max_results,
  });
  const parameters = new SqlParameters([reference.projectId]);
  const fields = reference.kind === 'model' ? registeredModelFields : modelVersionFields;
  const tagsColumn = reference.kind === 'model' ? 'mm.tags' : 'vm.tags';
  const resolveField = (field: string): SearchField => {
    // splitSearchField names an unprefixed field `attributes`, a prefix only Run search accepts.
    const { kind, key } = field.includes('.')
      ? splitSearchField(field)
      : { kind: 'attribute', key: field };
    const fieldKind = REGISTRY_FIELD_KINDS[kind];
    if (fieldKind === 'tag') {
      const tagValue = `COALESCE(${tagsColumn},'{}'::jsonb)->>${parameters.add(key)}`;
      return {
        expression:
          key === PROMPT_TAG_KEY
            ? `COALESCE(${tagValue},${parameters.add(MISSING_PROMPT_TAG_VALUE)})`
            : tagValue,
        numeric: false,
      };
    }
    const attribute =
      fieldKind === 'attribute' && Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (!attribute) invalidParameter(`unsupported search field: ${field}`);
    return attribute;
  };
  const filter = compileFilter({ filter: input.filter, parameters, resolveField });
  const orders = input.order_by.map((order) => {
    const parsed = /^([a-z_]+)(?:\s+(ASC|DESC))?$/i.exec(order.trim());
    const field = parsed && Object.hasOwn(fields, parsed[1]!) ? fields[parsed[1]!] : undefined;
    if (!field) invalidParameter('unsupported order field for the Model Registry');
    return `${field.expression} ${parsed?.[2]?.toUpperCase() ?? 'ASC'} NULLS LAST`;
  });
  const order = [
    ...orders,
    reference.kind === 'model' ? 'm.name ASC,m.id ASC' : 'v.created_at DESC,v.id DESC',
  ].join(',');
  const limit = parameters.add(page.size + 1);
  const offset = parameters.add(page.offset);
  return {
    parameters,
    page,
    filteredPageSql: `${filter} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
  };
}

export async function searchRegisteredModels(
  database: Database,
  projectId: string,
  input: SearchRegistry,
) {
  const search = registrySearch(input, { projectId, kind: 'model' });
  const matches = await rows<RegisteredModelRecord>(
    database,
    `${registeredModelSelect} WHERE m.project_id=$1 AND mm.deleted_at IS NULL AND ${search.filteredPageSql}`,
    search.parameters.values,
  );
  const { items, continuation } = cutPage(matches, search.page);
  const versionsByModel = await activeModelVersionsByModel(database, {
    projectId,
    modelIds: items.map((model) => model.id),
  });
  return {
    registered_models: items.map((model) =>
      registeredModelProtocol(model, versionsByModel.get(model.id) ?? []),
    ),
    ...continuation,
  };
}

export async function searchModelVersions(
  database: Database,
  projectId: string,
  input: SearchRegistry,
) {
  const search = registrySearch(input, { projectId, kind: 'version' });
  const matches = await rows<ModelVersionRecord>(
    database,
    `${modelVersionSelect} WHERE v.project_id=$1 AND vm.deleted_at IS NULL AND mm.deleted_at IS NULL AND ${search.filteredPageSql}`,
    search.parameters.values,
  );
  const { items, continuation } = cutPage(matches, search.page);
  return { model_versions: items.map(modelVersionProtocol), ...continuation };
}
