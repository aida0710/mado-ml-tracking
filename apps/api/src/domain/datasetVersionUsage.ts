import { DomainError } from './errors.js';

/**
 * DatasetVersionを指すことができ、それが無くなると壊れるかlineageを失うもの。レポートと
 * 保存ビューのフィルタは含めない。検索を絞るだけで、バージョンが無くても動く。
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

// 参照の種類ごとにAPIのエラーで使う名前。拒否のときに何を見ればよいかが分かるようにする。
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
 * バージョンを削除できるのは、何からも参照されていないあいだだけ。バージョンは変更できず、
 * それを指すRun・子孫のバージョン・起動のテンプレートは、何から作られたかを失ってしまう。
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
