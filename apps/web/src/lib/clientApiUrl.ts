/**
 * SDK、`mado-tracking`のCLI、workerに指定するURL（MMT_API_URL）。WebサーバーがAPIへ/apiを転送
 * するので、このページを開いたアドレスそのものになる。どれもoriginでも.../apiでも受け付ける。
 */
export function clientApiUrl(origin: string): string {
  return origin.replace(/\/+$/, '');
}
