import * as english from './en/datasets';
import { localized } from './localized';
// データセットのバージョンの中身。バージョンのダイアログでのフォルダのアップロードと、
// バージョンのファイル一覧。

export const datasetsText = localized({
  datasetVersionFromFolder: 'フォルダから作る',
  datasetVersionOptional: 'バージョン（空なら自動採番）',
  datasetFolderHint:
    'フォルダを選ぶと、中のファイルをArtifactとしてアップロードし、全部の保存が終わったらバージョンを作ります。',
  datasetFolderChoose: 'フォルダを選ぶ',
  datasetFolderUploadAndCreate: 'アップロードしてバージョンを作成',
  datasetFolderContinueAndCreate: '続きを送ってバージョンを作成',
  datasetFolderUnfinishedUploads: '途中のフォルダのアップロード',
  datasetFolderUnfinishedHint:
    'バージョンを作る前に止まったアップロードです。［続きを送る］で同じフォルダを選ぶと、保存済みで中身が同じファイルは送り直さず、残りだけを送ってバージョンを作ります。',
  datasetFolderDiscardNeedsAdmin: '保存済みのファイルを消せるのは Project admin です。続きを送ればそのまま使えます。',
  datasetFolderDiscardTitle: '途中のフォルダのアップロードを破棄',
  datasetFolderContinuationChecking: '前回の途中のアップロードと同じフォルダか確かめています…',
  datasetFolderStartNew: '新しく送る',
  datasetFolderStopMatching: '照合をやめる',
  datasetFolderShowKeptFiles: '残したファイルをArtifactsで見る',
  datasetFolderOverallProgress: 'フォルダ全体の進み具合',
  datasetParentsHint: 'このデータセットの最新のバージョンを選んであります。親にしないときは外してください。',
  datasetParentsEmpty: 'まだバージョンがありません。',
  datasetFolderCreating: 'バージョンを作成しています',
  datasetFolderRetryCreate: 'バージョンの作成を再試行',
  datasetFolderResendUnfinished: '残りのファイルを再送',
  datasetFolderCreateWithoutUnfinished: '残りのファイルを除いてバージョンを作成',
  datasetContentKind: '本体',
  datasetContentReference: '参照（URI）',
  datasetFiles: 'ファイル',
  datasetFileCount: 'ファイル数',
  datasetTotalSize: '合計サイズ',
  datasetFilesReferenceOnly: 'このバージョンはURIで登録した参照で、ファイル一覧を持ちません。',
  datasetFileSelect: 'ファイルを選ぶとプレビューを表示します。',
  datasetVersionUriPlaceholder: 's3://bucket/path/ や https://example.com/data.tar、file:///data/corpus',
  datasetVersionUriHint:
    'データの置き場所です。s3://（バケットとキー、またはフォルダ）、https://（1つのファイル）、file://（実行先のコンピュータ上のパス）を使えます。',
  datasetVersionDigestPlaceholder: 'sha256:0123…（64桁）',
  datasetVersionDigestHint:
    'データのSHA-256を「sha256:」と64桁の小文字の16進数で書きます。「sha256:」は省けるので、sha256sum data.tar の結果の64桁をそのまま貼っても構いません。https://のデータは実行前にこの値と照合します。',
  datasetActions: 'データセットの操作',
  datasetEditDescription: '説明を変更',
  datasetArchive: 'アーカイブ',
  datasetUnarchive: 'アーカイブを解除',
  datasetArchived: 'アーカイブ済み',
  datasetIncludeArchived: 'アーカイブ済みも表示',
  datasetNoDescription: '説明はありません。',
  datasetArchivedNotice:
    'アーカイブ済みです。新しいRun・Task・自動実行ルール・フックの入力には選べません。今あるバージョンとRunはそのまま使えます。',
  datasetNoVersions: 'まだバージョンがありません。',
  datasetNoVersionsEditor:
    'まだバージョンがありません。［フォルダから作る］でファイルをアップロードするか、［バージョンを作成］でS3などにあるデータのURIを登録してください。',
  datasetVersionInputRuns: 'このバージョンを入力にしたRun',
  datasetVersionShowLineage: 'Lineageで見る',
  datasetVersionDelete: 'このバージョンを削除',
  datasetVersionDeleteTitle: 'データセットのバージョンを削除',
  datasetVersionDeleteConfirm: '削除する',
}, english.datasetsText);

export const datasetsTextTemplates = localized({
  datasetFolderSelected: (count: number, size: string) => `${count}件のファイル（${size}）`,
  datasetFolderStartedAt: (startedAt: string) => `${startedAt} に始めたアップロード`,
  datasetFolderStoredFiles: (count: number, size: string) => `保存済み ${count}件（${size}）`,
  datasetFolderOpenUploads: (count: number, sent: string) => `送りかけ ${count}件（${sent} 送信済み）`,
  datasetFolderLastStored: (storedAt: string) => `最後の保存 ${storedAt}`,
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
      `${startedAt} に始めたアップロードを破棄します。`,
      storedFiles > 0
        ? `保存済みの${storedFiles}件（${storedSize}）のうち、どのバージョンにも使われていないファイルを削除します。`
        : '',
      openUploads > 0 ? `送りかけの${openUploads}件を取り消します。` : '',
      'ほかの人が今このフォルダを送っている途中なら、その送信は失敗します。',
    ].join(''),
  datasetFolderDiscardKeptFiles: (startedAt: string, kept: number) =>
    `${startedAt} に始めたアップロードを破棄しました。ただし${kept}件のファイルは、モデルバージョン・コードバージョン・checkpointが使っているため削除していません。その${kept}件が残るので、この試みは一覧に残ります。`,
  datasetFolderContinues: (startedAt: string, matched: number) =>
    `${startedAt} に始めたアップロードの続きとして送ります。前回と同じパス・大きさのファイルが${matched}件あり、中身が同じものは送り直しません。`,
  datasetFolderContinuesWithoutMatch: (startedAt: string) =>
    `${startedAt} に始めたアップロードの続きとして送りますが、前回と同じパス・大きさのファイルがありません。別のフォルダを選んでいないか確かめてください。`,
  datasetFolderMatching: (checked: number, total: number) =>
    `前回保存したファイルと中身を照合しています（${checked} / ${total}）`,
  datasetFolderReused: (count: number) => `前回保存した${count}件は送り直していません`,
  datasetFolderQueued: (count: number) => `待機中 ${count}件`,
  datasetFolderUnfinished: (unfinished: number, stored: number) =>
    `${unfinished}件のファイルがアップロードされていないため、バージョンはまだ作っていません。再送するか、それらを除いてバージョンを作ってください。` +
    (stored > 0
      ? `閉じても、保存済みの${stored}件はこのダイアログの「途中のフォルダのアップロード」に残り、あとで続きを送れます。`
      : ''),
  datasetContentArtifacts: (count: number, size: string) => `Artifact ${count}件 · ${size}`,
  datasetArchiveMessage: (name: string) =>
    `「${name}」をアーカイブします。新しいRun・Task・自動実行ルール・フックの入力には選べなくなります。今あるバージョンとRunはそのまま残り、あとで解除できます。`,
  datasetUnarchiveMessage: (name: string) =>
    `「${name}」のアーカイブを解除します。新しいRunなどの入力に、またバージョンを選べるようになります。`,
  datasetArchivedDone: (name: string) =>
    `「${name}」をアーカイブしました。一覧には、開いている間と［アーカイブ済みも表示］を付けたときに出ます。`,
  datasetUnarchivedDone: (name: string) => `「${name}」のアーカイブを解除しました。`,
  datasetVersionNoInputRuns: (version: string) => `バージョン「${version}」を入力にしたRunはまだありません。`,
  datasetVersionDeleteMessage: (version: string) =>
    `バージョン「${version}」を削除します。Runの入力・出力、ほかのバージョン、Taskなどから使われているときは削除できません。URIの先のデータとArtifactは消えません。`,
}, english.datasetsTextTemplates);
