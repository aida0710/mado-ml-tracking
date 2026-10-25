import type { Artifact } from '@mmt/contracts';
import { fetchArtifactTextHead } from '../../api/artifactTextHead';
import { trackingApi } from '../../api/tracking';
import { useQuery } from '../../hooks/useQuery';
import { formatBytes } from '../../lib/format';
import { Resource } from '../Feedback';
import { CodeView } from './CodeView';
import { PreviewDownloadNotice } from './PreviewDownloadNotice';
import { useLocale } from '../../i18n/useLocale';
import { textTemplates } from '../../i18n/catalog';
import { joinSentences } from '../../i18n/textJoining';

/**
 * テキストのプレビューはメインスレッドで色を付ける。1MiBなら1秒を十分に下回る。大きい
 * ファイルは先頭の1MiBを出す。学習のログなら、学習がどう始まったかはそこに書いてある。
 */
export const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;

function isTextHeadOnly(artifact: Artifact): boolean {
  return artifact.size > TEXT_PREVIEW_MAX_BYTES;
}

/**
 * 下のテキストがファイルの先頭だけであること（と`reason`、そもそもテキストで出す理由）を、
 * ダウンロードとともに伝える。ファイル全体を出していて、伝える理由も無いときは何も出さない。
 */
export function TextHeadNotice({ artifact, reason }: { artifact: Artifact; reason?: string }) {
  useLocale();
  const headMessage = isTextHeadOnly(artifact)
    ? textTemplates.previewTextHead(formatBytes(TEXT_PREVIEW_MAX_BYTES), formatBytes(artifact.size))
    : '';
  if (!reason && !headMessage) return null;
  return <PreviewDownloadNotice artifact={artifact} message={joinSentences([reason ?? '', headMessage])} />;
}

/** 形式に合わせて色を付けたテキスト。TEXT_PREVIEW_MAX_BYTESを超えると先頭だけを読む（Rangeの要求）。 */
export function TextPreview({ artifact, reason }: { artifact: Artifact; reason?: string }) {
  useLocale();
  const headOnly = isTextHeadOnly(artifact);
  const content = useQuery({ key: `${artifact.id}:${headOnly ? 'text-head' : 'text'}`, load: (signal) =>
    headOnly
      ? fetchArtifactTextHead(
          { projectId: artifact.projectId, artifactId: artifact.id, maxBytes: TEXT_PREVIEW_MAX_BYTES },
          signal,
        )
      : trackingApi.artifactText(artifact.projectId, artifact.id, signal),
  });
  return (
    <>
      <TextHeadNotice artifact={artifact} reason={reason} />
      <Resource query={content}>
        {(value) => <CodeView content={value} fileName={artifact.path} mimeType={artifact.mimeType} />}
      </Resource>
    </>
  );
}
