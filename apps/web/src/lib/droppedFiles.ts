// ファイルの選択やドラッグ＆ドロップを、選んだフォルダの中でのパス付きのファイルにする。

export interface UploadSource {
  file: File;
  /** ドロップしたか選んだフォルダより下のパス（フォルダ名を含む）。ばらのファイルは名前だけ。 */
  relativePath: string;
}

/** `webkitdirectory`の選択はwebkitRelativePathを埋める。ふつうの選択では空。 */
export function sourcesFromFileList(files: FileList | null): UploadSource[] {
  return Array.from(files ?? [], (file) => ({ file, relativePath: file.webkitRelativePath || file.name }));
}

/** ドロップしたフォルダにはentry APIからしか届かない。DataTransfer.filesでは空のファイルとして並ぶ。 */
export async function sourcesFromDataTransfer(dataTransfer: DataTransfer): Promise<UploadSource[]> {
  const entries = Array.from(dataTransfer.items, (item) => item.webkitGetAsEntry?.() ?? null);
  if (entries.some((entry) => entry === null)) return sourcesFromFileList(dataTransfer.files);
  const nested = await Promise.all(entries.map((entry) => collectEntry(entry as FileSystemEntry, '')));
  return nested.flat();
}

async function collectEntry(entry: FileSystemEntry, parentPath: string): Promise<UploadSource[]> {
  const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  if (isFileEntry(entry)) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    return [{ file, relativePath }];
  }
  if (!isDirectoryEntry(entry)) return [];
  const children = await readAllEntries(entry.createReader());
  const nested = await Promise.all(children.map((child) => collectEntry(child, relativePath)));
  return nested.flat();
}

/** readEntriesはディレクトリを何回かに分けて返し（Chromiumでは約100件ずつ）、最後に空を返す。 */
async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

const isFileEntry = (entry: FileSystemEntry): entry is FileSystemFileEntry => entry.isFile;
const isDirectoryEntry = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry => entry.isDirectory;
