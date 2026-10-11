import type { DatasetVersion } from '@mmt/contracts';
import { usePluginAvailability } from '../hooks/usePluginAvailability';
import { builtinPluginViews } from '../plugins/builtinPluginViews';

export function DatasetPluginActions({ projectId, version }: { projectId: string; version?: DatasetVersion }) {
  const availability = usePluginAvailability(projectId);
  return <>{availability.value?.map((connection) => {
    const view = builtinPluginViews.find((candidate) => candidate.kind === connection.kind);
    return view ? <view.DatasetActions
      key={connection.id ?? connection.kind}
      projectId={projectId}
      availability={connection}
      version={version}
    /> : null;
  })}</>;
}
