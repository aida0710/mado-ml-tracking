import { DomainError } from './errors.js';

// 参照型のバージョンは、中身をSHA-256で示す。小文字の16進64桁で、Artifactのバージョンの
// manifestのdigestに付く`sha256:`はあってもなくてもよい。これはworkerがhttps://の
// ダウンロードを照合する形（worker/dataset_downloads.pyのSHA256_DIGEST）で、ほかの文字列は
// 保存されても照合されないので、打ち間違いに気づけない。digestは渡されたまま保存するので、
// 同じバージョンをもう一度登録するSDKは同じ文字列どうしで比べられる。
const SHA256_DIGEST = /^(?:sha256:)?[0-9a-f]{64}$/;

const REFERENCE_DIGEST_EXAMPLE = 'sha256:<64 lowercase hex digits> (the sha256: prefix is optional)';

/** ネイティブAPIで登録する参照型のバージョンのdigestがSHA-256でなければ拒む（422）。 */
export function assertReferenceDigest(digest: string): void {
  if (SHA256_DIGEST.test(digest)) return;
  throw new DomainError({
    status: 422,
    code: 'dataset_digest_invalid',
    message: `specify the digest as ${REFERENCE_DIGEST_EXAMPLE}`,
  });
}
