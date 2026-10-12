import { formatEnglishCount } from '../formatEnglishCount';
export const datasetsText = {
  datasetVersionFromFolder: 'Create from a folder',
  datasetVersionOptional: 'Version (leave blank to auto-number)',
  datasetFolderHint:
    'Choose a folder to upload its files as artifacts. The version is created after every file is stored.',
  datasetFolderChoose: 'Choose folder',
  datasetFolderUploadAndCreate: 'Upload and create version',
  datasetFolderContinueAndCreate: 'Continue upload and create version',
  datasetFolderUnfinishedUploads: 'Incomplete folder uploads',
  datasetFolderUnfinishedHint:
    'These uploads stopped before a version was created. Press “Continue upload” and choose the same folder to upload only the remaining files and create the version. Stored files with the same content are not sent again.',
  datasetFolderDiscardNeedsAdmin:
    'Only project administrators can delete stored files. Continue the upload to use them as they are.',
  datasetFolderDiscardTitle: 'Discard incomplete folder upload',
  datasetFolderContinuationChecking: 'Checking whether this is the same folder as the incomplete upload…',
  datasetFolderStartNew: 'Start new upload',
  datasetFolderStopMatching: 'Stop comparing',
  datasetFolderShowKeptFiles: 'View kept files in Artifacts',
  datasetFolderOverallProgress: 'Overall folder progress',
  datasetParentsHint: 'The latest version of this dataset is preselected. Clear it if it should not be a parent.',
  datasetParentsEmpty: 'No versions yet.',
  datasetFolderCreating: 'Creating version',
  datasetFolderRetryCreate: 'Retry version creation',
  datasetFolderResendUnfinished: 'Resend remaining files',
  datasetFolderCreateWithoutUnfinished: 'Create version without remaining files',
  datasetContentKind: 'Files',
  datasetContentReference: 'Reference (URI)',
  datasetFiles: 'Files',
  datasetFileCount: 'File count',
  datasetTotalSize: 'Total size',
  datasetFilesReferenceOnly: 'This version is registered as a URI reference and has no file manifest.',
  datasetFileSelect: 'Select a file to preview it.',
  datasetVersionUriPlaceholder: 's3://bucket/path/, https://example.com/data.tar, or file:///data/corpus',
  datasetVersionUriHint:
    'Where the data is stored. Use s3:// (a bucket and key, or a folder), https:// (a single file), or file:// (a path on the computer that runs the job).',
  datasetVersionDigestPlaceholder: 'sha256:0123… (64 digits)',
  datasetVersionDigestHint:
    'The SHA-256 of the data, written as “sha256:” followed by 64 lowercase hexadecimal digits. “sha256:” is optional, so you can paste the 64 digits printed by sha256sum data.tar as they are. Data at https:// is checked against this value before execution.',
  datasetActions: 'Dataset actions',
  datasetEditDescription: 'Edit description',
  datasetArchive: 'Archive',
  datasetUnarchive: 'Unarchive',
  datasetArchived: 'Archived',
  datasetIncludeArchived: 'Include archived datasets',
  datasetNoDescription: 'No description.',
  datasetArchivedNotice:
    'This dataset is archived. It cannot be selected as an input for new runs, tasks, automation rules, or hooks. Existing versions and runs remain usable.',
  datasetNoVersions: 'No versions yet.',
  datasetNoVersionsEditor:
    'No versions yet. Upload files with “Create from a folder”, or register the URI of data in S3 or elsewhere with “Create version”.',
  datasetVersionInputRuns: 'Runs using this version as input',
  datasetVersionShowLineage: 'View in Lineage',
  datasetVersionDelete: 'Delete this version',
  datasetVersionDeleteTitle: 'Delete dataset version',
  datasetVersionDeleteConfirm: 'Delete',
};

export const datasetsTextTemplates = {
  datasetFolderSelected: (count: number, size: string) => `${formatEnglishCount(count, 'file')} (${size})`,
  datasetFolderStartedAt: (startedAt: string) => `Upload started ${startedAt}`,
  datasetFolderStoredFiles: (count: number, size: string) => `Stored: ${formatEnglishCount(count, 'file')} (${size})`,
  datasetFolderOpenUploads: (count: number, sent: string) =>
    `Partially uploaded: ${formatEnglishCount(count, 'file')} (${sent} sent)`,
  datasetFolderLastStored: (storedAt: string) => `Last stored ${storedAt}`,
  datasetFolderDiscardMessage: ({
    startedAt,
    storedFiles,
    storedSize,
    openUploads,
  }: {
    startedAt: string;
    storedFiles: number;
    storedSize: string;
    openUploads: number;
  }) =>
    [
      `Discard the upload started ${startedAt}?`,
      storedFiles > 0
        ? ` Stored files not used by any version will be deleted (${formatEnglishCount(storedFiles, 'file')} stored, ${storedSize}).`
        : '',
      openUploads > 0 ? ` The upload of ${formatEnglishCount(openUploads, 'partially sent file')} will be canceled.` : '',
      ' If someone else is uploading this folder right now, their upload will fail.',
    ].join(''),
  datasetFolderDiscardKeptFiles: (startedAt: string, kept: number) => {
    const isSingleFile = kept === 1;
    return (
      `Discarded the upload started ${startedAt}. However, ${formatEnglishCount(kept, 'file')} ${isSingleFile ? 'was' : 'were'} not deleted` +
      ` because model versions, code versions, or checkpoints use ${isSingleFile ? 'it' : 'them'}.` +
      ` Because ${isSingleFile ? 'it remains' : 'they remain'}, this attempt stays in the list.`
    );
  },
  datasetFolderContinues: (startedAt: string, matched: number) =>
    `Continuing the upload started ${startedAt}. ${formatEnglishCount(matched, 'file')} ${matched === 1 ? 'has' : 'have'} the same path and size as before; files with the same content are not sent again.`,
  datasetFolderContinuesWithoutMatch: (startedAt: string) =>
    `Continuing the upload started ${startedAt}, but no file has the same path and size as before. Make sure you did not choose a different folder.`,
  datasetFolderMatching: (checked: number, total: number) =>
    `Comparing contents with previously stored files (${checked} / ${total})`,
  datasetFolderReused: (count: number) => `Skipped ${formatEnglishCount(count, 'previously stored file')}`,
  datasetFolderQueued: (count: number) => `${formatEnglishCount(count, 'file')} queued`,
  datasetFolderUnfinished: (unfinished: number, stored: number) => {
    const filePronoun = unfinished === 1 ? 'it' : 'them';
    const unfinishedFileMessage =
      `${formatEnglishCount(unfinished, 'file')} ${unfinished === 1 ? 'has' : 'have'} not been uploaded, so the version has not been created.` +
      ` Retry uploading ${filePronoun} or create the version without ${filePronoun}.`;
    if (stored <= 0) return unfinishedFileMessage;
    return (
      `${unfinishedFileMessage} Even after closing, the ${formatEnglishCount(stored, 'stored file')}` +
      ` ${stored === 1 ? 'stays' : 'stay'} under “Incomplete folder uploads” in this dialog, so you can continue the upload later.`
    );
  },
  datasetContentArtifacts: (count: number, size: string) => `${formatEnglishCount(count, 'artifact')} · ${size}`,
  datasetArchiveMessage: (name: string) =>
    `Archive “${name}”? It can no longer be selected as an input for new runs, tasks, automation rules, or hooks. Existing versions and runs remain, and you can unarchive it later.`,
  datasetUnarchiveMessage: (name: string) =>
    `Unarchive “${name}”? Its versions can be selected again as inputs for new runs and other items.`,
  datasetArchivedDone: (name: string) =>
    `Archived “${name}”. It stays in the list while it is open, and appears when “Include archived datasets” is selected.`,
  datasetUnarchivedDone: (name: string) => `Unarchived “${name}”.`,
  datasetVersionNoInputRuns: (version: string) => `No runs use version “${version}” as input yet.`,
  datasetVersionDeleteMessage: (version: string) =>
    `Delete version “${version}”? It cannot be deleted while it is used as a run input or output, or by other versions, tasks, and so on. The data at its URI and its artifacts are not deleted.`,
};
