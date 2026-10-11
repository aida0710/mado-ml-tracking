import * as english from './en/storage';
import { localized } from './localized';
// Artifact storage backends: the admin table, the backend dialog and the connection test.
export const storageText = localized({
  newStorageBackend: '保存先を追加',
  editStorageBackend: '保存先を変更',
  storageBackendKind: '種類',
  storageLocation: '保存場所',
  storageSignature: '署名',
  storageState: '状態',
  storageSource: '定義元',
  storageSourceEnvironment: '環境変数',
  storageSourceDatabase: '画面',
  storageEnvironmentReadOnly: '環境変数で定義されているため、画面からは変更できません',
  storageDefault: '既定',
  storageDefaultMark: '既定の保存先',
  storageMakeDefault: '既定にする',
  storageMakeDefaultTitle: '既定の保存先を変更',
  storageNoBackends: '保存先はまだありません',
  storageRootPath: 'ルートディレクトリ',
  storageEndpoint: 'Endpoint URL（AWSなら空欄）',
  storageRegion: 'Region',
  storageBucket: 'Bucket',
  storagePrefix: 'Prefix（任意）',
  storagePathStyle: 'path-styleでアクセスする',
  storageSignatureV4: 'Signature Version 4',
  storageSignatureV2: 'Signature Version 2',
  storageTlsVerify: 'TLS証明書を検証する',
  storageCaBundle: 'CA証明書（PEM、任意）',
  storageCaBundleConfigured: '設定済み（空欄のままなら変更しません）',
  storageClearCaBundle: '保存済みのCA証明書を削除する',
  storageChecksumMode: 'Checksumの扱い',
  storageChecksumWhenRequired: '必要なときだけ（WHEN_REQUIRED）',
  storageChecksumWhenSupported: '対応していれば常に（WHEN_SUPPORTED）',
  storageMultipartEnabled: 'Multipart uploadを使う（使わない場合は1件5GiBまで）',
  storagePartSize: 'Multipartのpartサイズ（MiB）',
  storageAccessKeyId: 'Access key ID（任意）',
  storageSecretAccessKey: 'Secret access key',
  storageSecretConfigured: '設定済み（空欄のままなら変更しません）',
  storageEnabled: '有効（無効にしても既存のArtifactは読めます）',
  storageTest: '接続テスト',
  storageTestResult: '接続テストの結果',
  storageTestOk: 'OK',
  storageTestNg: 'NG',
  storageTestPassed: 'すべての段階が成功しました',
  storageTestFailed: '失敗した段階があります',
  storageTestStepPut: '書き込み',
  storageTestStepGet: '読み出し',
  storageTestStepRange: '範囲指定の読み出し',
  storageTestStepDelete: '削除',
  storageNameError: '名前は小文字の英数字とハイフンで、先頭を英数字にしてください（63文字まで）',
  storageRootPathError: 'ルートディレクトリは絶対パスで指定してください',
  storageEndpointError: 'Endpoint URLはhttp://またはhttps://で始まるURLにしてください',
  storageBucketError:
    'Bucket名は3〜63文字の小文字英数字・ハイフン・ドットで、先頭と末尾を英数字にしてください',
  storageCaBundleError: 'CA証明書はPEM形式（-----BEGIN CERTIFICATE-----）で貼り付けてください',
  storageSecretRequired: 'Access key IDを指定するときはSecret access keyも入力してください',
  storageDirectoryTruncated: '候補が多いため一部だけを表示しています。続けて入力すると絞り込めます。',
  storageRootPathHint:
    'API serverのディレクトリです。データ用のディスク（/srv、/mnt、/homeなど）の下を指定します。空欄で選ぶと候補が出ます（/procや/usrなどシステムのディレクトリは出しません）。',
  storageAdvancedSettings: '詳細設定（署名・TLS・Checksum・Multipart）',
  storageTestFailedFix: '［設定を変更］で設定を直し、もう一度［接続テスト］を押してください。',
  storageEditAfterFailure: '設定を変更',
  storageMakeDefaultTestFirst:
    '既定にする前に接続テストを行い、失敗したときは既定にしません。',
  storageMakeDefaultTestFailed:
    '接続テストに失敗したため、既定の保存先にしませんでした。下の結果を見て設定を直してから、もう一度試してください。',
  // The storage choice of a new Project: the default first, the others folded away.
  newProjectStorageOthers: 'ほかの保存先を選ぶ',
  newProjectStorageHint:
    '保存先は全体管理者が用意したものです。どこに保存されるかは全体管理者に確かめてください。あとから［プロジェクト設定］で変えられます（それまでのArtifactは元の保存先に残ります）。',
} as const, english.storageText);

export const storageTextTemplates = localized({
  newProjectStorageDefault: (backend: string) =>
    `既定の保存先「${backend}」に保存します。迷ったらこのままにします。`,
  storageDirectoryMissing: (path: string) =>
    `${path} はサーバにまだありません。接続テストか最初の保存のときに作成します。`,
  storageDirectoryNotDirectory: (path: string) =>
    `${path} はディレクトリではありません。別のパスを指定してください。`,
  storageDirectoryUnavailable: (path: string) =>
    `${path} をサーバがすぐに読めませんでした。ネットワークのディスクが応答していない可能性があります。`,
  storagePartSizeError: (minimumMib: number, maximumMib: number) =>
    `partサイズは${minimumMib}〜${maximumMib} MiBの整数で指定してください`,
  storageMakeDefaultConfirm: (name: string) =>
    `新しいプロジェクトの既定の保存先を「${name}」にします。既存のArtifactは移動しません。`,
}, english.storageTextTemplates);
