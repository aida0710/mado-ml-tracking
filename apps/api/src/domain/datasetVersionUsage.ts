import { DomainError } from './errors.js';

/**
 * What can point at a DatasetVersion and would break or lose its lineage without it. Report and
 * saved-view filters are left out: they only narrow a search and still work without the version.
 */
export type DatasetVersionReferenceKind =
  | 'runInput'
  | 'runOutput'
  | 'childVersion'
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
  runInput: 'Runの入力',
  runOutput: 'Runの出力',
  childVersion: 'このバージョンを親にしたバージョン',
  task: 'Taskの入力',
  automationRule: '自動実行ルールの入力',
  hook: 'フックの入力',
  jobPartition: 'Jobの分割の入力',
  outputDeclaration: 'Runの出力の宣言',
  mlflowDataset: 'MLflowの記録',
  workflowVersion: 'ワークフローの入力',
};

/**
 * A version is deleted only while nothing refers to it: versions are immutable, and a Run, a
 * descendant version or a launch template that names it would lose what it was made from.
 */
export function assertDatasetVersionUnused(counts: DatasetVersionReferenceCounts): void {
  const uses = (Object.keys(REFERENCE_LABELS) as DatasetVersionReferenceKind[])
    .filter((kind) => counts[kind] > 0)
    .map((kind) => `${REFERENCE_LABELS[kind]} ${counts[kind]}件`);
  if (!uses.length) return;
  throw new DomainError(
    409,
    `このバージョンは使われているため削除できません（${uses.join('、')}）`,
    'dataset_version_in_use',
  );
}
