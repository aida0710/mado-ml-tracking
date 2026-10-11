/** The operation and original failure stay available after the display language changes. */
export interface UploadFailure {
  kind: 'request' | 'cancel';
  cause: unknown;
}
