/**
 * The URL the SDKs, the `mado-tracking` CLI and the worker are pointed at (MMT_API_URL): the
 * address this page was opened with, since the Web server forwards /api to the API. They accept
 * the origin as well as .../api.
 */
export function clientApiUrl(origin: string): string {
  return origin.replace(/\/+$/, '');
}
