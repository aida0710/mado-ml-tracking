/** 表示言語を変えた後も、どの操作だったかと元の失敗を参照できるようにしておく。 */
export interface UploadFailure {
  kind: 'request' | 'cancel';
  cause: unknown;
}
