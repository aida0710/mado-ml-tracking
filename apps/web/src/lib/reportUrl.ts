// レポートのページのアドレス。現在のバージョンを表示し、`?revision=`で過去のバージョンを表示する。

export const REPORT_REVISION_PARAM = 'revision';

/** `?revision=`の値が指すバージョン。バージョンを指していなければundefined（現在のバージョン）。 */
export function parseRevisionParam(value: string | null): number | undefined {
  const revision = Number(value);
  return value && Number.isInteger(revision) && revision > 0 ? revision : undefined;
}

/** レポートの1つのバージョンを開くリンク。後で保存しても同じバージョンを指し続ける。 */
export function reportRevisionUrl({
  origin,
  projectId,
  reportId,
  revision,
}: {
  origin: string;
  projectId: string;
  reportId: string;
  revision: number;
}): string {
  const query = new URLSearchParams({ [REPORT_REVISION_PARAM]: String(revision) });
  return new URL(`/projects/${encodeURIComponent(projectId)}/reports/${encodeURIComponent(reportId)}?${query}`, origin).href;
}
