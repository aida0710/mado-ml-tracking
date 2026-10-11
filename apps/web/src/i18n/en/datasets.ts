import { formatEnglishCount } from '../formatEnglishCount';
export const datasetsText = {
  datasetVersionFromFolder: "Create from a folder",
  datasetVersionOptional: "Version (leave blank to auto-number)",
  datasetFolderHint:
    "Select a folder to upload its files as artifacts. The version is created after every file is stored.",
  datasetFolderChoose: "Select folder",
  datasetFolderUploadAndCreate: "Upload and create version",
  datasetFolderCreating: "Creating version",
  datasetFolderRetryCreate: "Retry version creation",
  datasetFolderResendUnfinished: "Resend remaining files",
  datasetFolderCreateWithoutUnfinished: "Create version without remaining files",
  datasetContentKind: "Files",
  datasetContentReference: "Reference (URI)",
  datasetFiles: "Files",
  datasetFileCount: "File count",
  datasetTotalSize: "Total size",
  datasetFilesReferenceOnly: "This version is registered as a URI reference and has no file manifest.",
  datasetFileSelect: "Select a file to preview it.",
};

export const datasetsTextTemplates = {
  datasetFolderSelected: (count: number, size: string) => `${formatEnglishCount(count, 'file')} (${size})`,
  datasetFolderUnfinished: (unfinished: number, stored: number) => {
    const filePronoun = unfinished === 1 ? 'it' : 'them';
    const unfinishedFileMessage =
      `${formatEnglishCount(unfinished, 'file')} ${unfinished === 1 ? 'has' : 'have'} not been uploaded, so the version has not been created.` +
      ` Retry uploading ${filePronoun} or create the version without ${filePronoun}.`;
    if (stored <= 0) return unfinishedFileMessage;
    const artifactNoun = stored === 1 ? 'an artifact' : 'artifacts';
    return `${unfinishedFileMessage} Closing leaves ${formatEnglishCount(stored, 'uploaded file')} as ${artifactNoun} without a version or run.`;
  },
  datasetContentArtifacts: (count: number, size: string) => `${formatEnglishCount(count, 'artifact')} · ${size}`,
};
