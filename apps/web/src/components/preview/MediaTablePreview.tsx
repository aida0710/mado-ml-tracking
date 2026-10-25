import type { Artifact } from '@mmt/contracts';
import { runMediaApi } from '../../api/runMedia';
import { useQuery } from '../../hooks/useQuery';
import { Resource } from '../Feedback';
import { MediaTableView } from '../media/MediaTableView';
import { TextPreview } from './TextPreview';

/**
 * RunのJSONファイルを、記録したときのメディアの表（MLflowのlog_tableまたはネイティブの表）
 * として描く。音声と画像のセルはメディアのタブと同じ。ほかのJSONファイルは普通のテキストのまま。
 */
export function MediaTablePreview({ artifact, runId }: { artifact: Artifact; runId: string }) {
  const table = useQuery({ key: `${artifact.projectId}:artifact-media-table:${artifact.id}`, load: (signal) =>
    runMediaApi.tableOfArtifact(artifact.projectId, { runId, artifactId: artifact.id }, signal),
  });
  return (
    <Resource query={table}>
      {(media) =>
        media ? (
          <MediaTableView projectId={artifact.projectId} runId={runId} mediaId={media.id} />
        ) : (
          <TextPreview artifact={artifact} />
        )
      }
    </Resource>
  );
}
