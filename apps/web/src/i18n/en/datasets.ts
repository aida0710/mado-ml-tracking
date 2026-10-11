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
  datasetFiles: "File",
  datasetFileCount: "File count",
  datasetTotalSize: "Total size",
  datasetFilesReferenceOnly: "This version is registered as a URI reference and has no file manifest.",
  datasetFileSelect: "Select a file to preview it.",
};

export const datasetsTextTemplates = {
  datasetFolderSelected: (count: number, size: string) => `${count} files (${size})`,
  datasetFolderUnfinished: (unfinished: number, stored: number) =>
    `${unfinished} files have not been uploaded, so the version has not been created. Retry uploading them or create the version without them.` +
    (stored > 0 ? `Closing leaves ${stored} uploaded files as artifacts without a version or run.` : ''),
  datasetContentArtifacts: (count: number, size: string) => `${count} artifacts · ${size}`,
};
