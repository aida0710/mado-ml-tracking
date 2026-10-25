import { DomainError } from './errors.js';

/**
 * What can point at a DatasetVersion and would break or lose its lineage without it. Report and
 * saved-view filters are left out: they only narrow a search and still work without the version.
 */
export type DatasetVersionReferenceKind =
  | 'runInput'
  | 'runOutput'
  | 'childVersion'
  | 'parentAddition'
  | 'lineageRelation'
  | 'task'
  | 'automationRule'
  | 'hook'
  | 'jobPartition'
  | 'outputDeclaration'
  | 'mlflowDataset'
  | 'workflowVersion';

export type DatasetVersionReferenceCounts = Record<DatasetVersionReferenceKind, number>;

// Names the API error uses for each kind of reference, so the refusal says what to look at.
const REFERENCE_LABELS: Record<DatasetVersionReferenceKind, string> = {
  runInput: 'run inputs',
  runOutput: 'run outputs',
  childVersion: 'versions with this version as a parent',
  parentAddition: 'parent addition history',
  lineageRelation: 'supplemented lineage records',
  task: 'task inputs',
  automationRule: 'automation rule inputs',
  hook: 'hook inputs',
  jobPartition: 'job partition inputs',
  outputDeclaration: 'run output declarations',
  mlflowDataset: 'MLflow records',
  workflowVersion: 'workflow inputs',
};

/**
 * A version is deleted only while nothing refers to it: versions are immutable, and a Run, a
 * descendant version or a launch template that names it would lose what it was made from.
 */
export function assertDatasetVersionUnused(counts: DatasetVersionReferenceCounts): void {
  const usedKinds = (Object.keys(REFERENCE_LABELS) as DatasetVersionReferenceKind[]).filter(
    (kind) => counts[kind] > 0,
  );
  if (!usedKinds.length) return;
  const uses = usedKinds.map((kind) => `${REFERENCE_LABELS[kind]}: ${counts[kind]}`);
  throw new DomainError({
    status: 409,
    code: 'dataset_version_in_use',
    message: `this version is in use and cannot be deleted (${uses.join(', ')})`,
    details: { usages: Object.fromEntries(usedKinds.map((kind) => [kind, counts[kind]])) },
  });
}
