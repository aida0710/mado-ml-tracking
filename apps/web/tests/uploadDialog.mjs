// ブラウザ検査で、Artifactのアップロードのダイアログ（複数のファイルを受け付けるキュー）を操作する。

/** 開いているアップロードのダイアログでファイルを1つアップロードし、完了したらキューのその行を返す。 */
export async function uploadOneFile(uploadDialog, file) {
  await uploadDialog.getByLabel('ファイルを選ぶ', { exact: true }).setInputFiles(file);
  await uploadDialog.getByRole('button', { name: 'アップロードを開始', exact: true }).click();
  const row = uploadDialog.getByTestId('upload-queue-row').filter({ hasText: file.name });
  await row.and(uploadDialog.page().locator('[data-status="completed"]')).waitFor();
  return row;
}

/** 複数のファイルを受け付けるダイアログは、アップロードが終わっても閉じるまで開いたまま。 */
export async function closeUploadDialog(uploadDialog) {
  await uploadDialog.locator('footer').getByRole('button', { name: '閉じる', exact: true }).click();
  await uploadDialog.waitFor({ state: 'hidden' });
}
