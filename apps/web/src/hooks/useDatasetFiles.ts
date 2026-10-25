import { datasetContentApi, type DatasetVersionLocation } from '../api/datasetContent';
import { useCursorPages } from './useCursorPages';
import { useQuery } from './useQuery';

// ディレクトリの1画面分。RunのArtifactのブラウザと同じ。
export const DATASET_FILE_PAGE_SIZE = 200;

/** DatasetVersionのディレクトリの1階層。件数付きのサブディレクトリと、ページごとのファイル。 */
export function useDatasetFiles(location: DatasetVersionLocation, prefix: string) {
  const key = `${location.projectId}:dataset-files:${location.versionId}:${prefix}`;
  const tree = useQuery({ key: `${key}:tree`, load: (signal) => datasetContentApi.fileTree(location, prefix, signal) });
  const files = useCursorPages(`${key}:files`, (cursor, signal) =>
    datasetContentApi.directoryFiles(location, { prefix, limit: DATASET_FILE_PAGE_SIZE, cursor }, signal),
  );
  return { tree, files };
}
