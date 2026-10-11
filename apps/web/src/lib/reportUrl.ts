// The report page's address: the report shows its current revision, and `?revision=` a past one.

export const REPORT_REVISION_PARAM = 'revision';

/** The revision a `?revision=` value names, or undefined (the current revision) when it is not one. */
export function parseRevisionParam(value: string | null): number | undefined {
  const revision = Number(value);
  return value && Number.isInteger(revision) && revision > 0 ? revision : undefined;
}

/** A link that opens one revision of a report; it keeps pointing there after later saves. */
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
