import { DomainError } from './errors.js';

// A reference version names its content by its SHA-256: 64 lowercase hex digits, with or without
// the `sha256:` an Artifact version's manifest digest carries. These are the forms the worker
// checks an https:// download against (SHA256_DIGEST in worker/dataset_downloads.py); any other
// text would be stored and never checked, so a typo would go unnoticed. The digest is stored as
// given, so an SDK that registers the same version again compares equal text.
const SHA256_DIGEST = /^(?:sha256:)?[0-9a-f]{64}$/;

const REFERENCE_DIGEST_EXAMPLE = 'sha256:<64 lowercase hex digits> (the sha256: prefix is optional)';

/** Refuses (422) a digest of a natively registered reference version that is not a SHA-256. */
export function assertReferenceDigest(digest: string): void {
  if (SHA256_DIGEST.test(digest)) return;
  throw new DomainError({
    status: 422,
    code: 'dataset_digest_invalid',
    message: `specify the digest as ${REFERENCE_DIGEST_EXAMPLE}`,
  });
}
