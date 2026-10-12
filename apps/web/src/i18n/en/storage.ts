export const storageText = {
  newStorageBackend: 'Add storage backend',
  editStorageBackend: 'Update storage backend',
  storageBackendKind: 'Type',
  storageLocation: 'Storage locations',
  storageSignature: 'Signature',
  storageState: 'Status',
  storageSource: 'Defined by',
  storageSourceEnvironment: 'Environment variables',
  storageSourceDatabase: 'Web UI',
  storageEnvironmentReadOnly: 'Defined by environment variables; cannot be changed in the UI',
  storageDefault: 'Default',
  storageDefaultMark: 'Default storage backend',
  storageMakeDefault: 'Set as default',
  storageMakeDefaultTitle: 'Change default storage backend',
  storageNoBackends: 'No storage backends yet',
  storageRootPath: 'Root directory',
  storageEndpoint: 'Endpoint URL (blank for AWS)',
  storageRegion: 'Region',
  storageBucket: 'Bucket',
  storagePrefix: 'Prefix (optional)',
  storagePathStyle: 'Use path-style access',
  storageSignatureV4: 'Signature Version 4',
  storageSignatureV2: 'Signature Version 2',
  storageTlsVerify: 'Verify TLS certificates',
  storageCaBundle: 'CA certificate (PEM, optional)',
  storageCaBundleConfigured: 'Configured (leave blank to keep unchanged)',
  storageClearCaBundle: 'Remove saved CA certificate',
  storageChecksumMode: 'Checksum behavior',
  storageChecksumWhenRequired: 'Only when required (WHEN_REQUIRED)',
  storageChecksumWhenSupported: 'Whenever supported (WHEN_SUPPORTED)',
  storageMultipartEnabled: 'Use multipart uploads (otherwise limited to 5GiB per file)',
  storagePartSize: 'Multipart part size (MiB)',
  storageAccessKeyId: 'Access key ID (optional)',
  storageSecretAccessKey: 'Secret access key',
  storageSecretConfigured: 'Configured (leave blank to keep unchanged)',
  storageEnabled: 'Enabled (existing artifacts remain readable when disabled)',
  storageTest: 'Connection test',
  storageTestResult: 'Connection test results',
  storageTestOk: 'OK',
  storageTestNg: 'Failed',
  storageTestPassed: 'All stages succeeded',
  storageTestFailed: 'Some stages failed',
  storageTestStepPut: 'Write',
  storageTestStepGet: 'Read',
  storageTestStepRange: 'Range read',
  storageTestStepDelete: 'Delete',
  storageNameError: 'Names must start with a lowercase letter or number and contain only lowercase letters, numbers, and hyphens (up to 63 characters)',
  storageRootPathError: 'Root directory must be an absolute path',
  storageEndpointError: 'Endpoint URL must start with http:// or https://',
  storageBucketError:
    'Bucket names must use 3–63 lowercase letters, numbers, hyphens, or dots and start and end with a letter or number',
  storageCaBundleError: 'Paste a PEM CA certificate (-----BEGIN CERTIFICATE-----)',
  storageSecretRequired: 'Specify a secret access key when providing an access key ID',
  storageDirectoryTruncated: 'Only some suggestions are shown. Keep typing to narrow them down.',
  storageRootPathHint:
    'A directory on the API server. Choose one under a data disk (/srv, /mnt, /home, etc.). Focus the empty field to see suggestions (system directories such as /proc and /usr are not shown).',
  storageAdvancedSettings: 'Advanced settings (signature, TLS, checksum, multipart)',
  storageTestFailedFix: 'Fix the settings with “Change settings”, then press “Connection test” again.',
  storageEditAfterFailure: 'Change settings',
  storageMakeDefaultTestFirst:
    'A connection test runs first, and the backend does not become the default if it fails.',
  storageMakeDefaultTestFailed:
    'The connection test failed, so the default storage backend was not changed. Fix the settings using the results below, then try again.',
  // The storage choice of a new Project: the default first, the others folded away.
  newProjectStorageOthers: 'Choose another storage backend',
  newProjectStorageHint:
    'Storage backends are set up by global administrators. Ask a global administrator where data is stored. You can change the backend later in “Project settings” (artifacts saved until then stay in the original backend).',
} as const;

export const storageTextTemplates = {
  newProjectStorageDefault: (backend: string) =>
    `Artifacts are saved to the default storage backend “${backend}”. If unsure, keep this.`,
  storageDirectoryMissing: (path: string) =>
    `${path} does not exist on the server yet. It will be created during a connection test or the first save.`,
  storageDirectoryNotDirectory: (path: string) =>
    `${path} is not a directory. Specify another path.`,
  storageDirectoryUnavailable: (path: string) =>
    `The server could not read ${path} promptly. The network disk may not be responding.`,
  storagePartSizeError: (minimumMib: number, maximumMib: number) =>
    `Part size must be an integer from ${minimumMib} to ${maximumMib} MiB`,
  storageMakeDefaultConfirm: (name: string) =>
    `Set “${name}” as the default storage backend for new projects? Existing artifacts are not moved.`,
};
