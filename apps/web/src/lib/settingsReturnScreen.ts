// 全体設定を開く前に利用者がいたProjectの画面。全体設定から、アプリ名を通じてProjectの最初の
// ページへ戻るだけでなく、その画面へ戻れるようにする。ブラウザのタブごとに持つ（sessionStorage）。
// 別のタブは別のProjectにいるかもしれない。
const SETTINGS_RETURN_STORAGE_KEY = 'mmt.settings.returnScreen';

export interface SettingsReturnScreen {
  /** Projectの画面のパスとクエリ。 */
  path: string;
  projectName: string;
}

function isReturnScreen(value: unknown): value is SettingsReturnScreen {
  const screen = value as Partial<SettingsReturnScreen> | null;
  return (
    typeof screen?.path === 'string' &&
    screen.path.startsWith('/projects/') &&
    typeof screen.projectName === 'string'
  );
}

export function readSettingsReturnScreen(): SettingsReturnScreen | null {
  try {
    const stored: unknown = JSON.parse(
      sessionStorage.getItem(SETTINGS_RETURN_STORAGE_KEY) ?? 'null',
    );
    return isReturnScreen(stored) ? stored : null;
  } catch {
    // ストレージが使えないか値が壊れているとき。全体設定は以前と同じく、アプリ名だけを出す。
    return null;
  }
}

export function rememberSettingsReturnScreen(screen: SettingsReturnScreen): void {
  try {
    sessionStorage.setItem(SETTINGS_RETURN_STORAGE_KEY, JSON.stringify(screen));
  } catch {
    /* 戻る案内は便利のためのもので、無くてもアプリは動く。 */
  }
}
