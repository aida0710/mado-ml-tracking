/** Content-Disposition of a download: attachment with an ASCII fallback and the RFC 5987 UTF-8 name. */
export function attachmentDisposition(fileName: string): string {
  const asciiName = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
