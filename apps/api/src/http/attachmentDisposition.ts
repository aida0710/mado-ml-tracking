/** ダウンロードのContent-Disposition。ASCIIの代替名とRFC 5987のUTF-8の名前を付けたattachment。 */
export function attachmentDisposition(fileName: string): string {
  const asciiName = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
