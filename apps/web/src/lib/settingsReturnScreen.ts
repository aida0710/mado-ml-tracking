// The Project screen the user was on before opening 全体設定, so 全体設定 can lead back to it
// rather than only to the Project's start page through the app name. Kept per browser tab
// (sessionStorage): another tab may be in another Project.
const SETTINGS_RETURN_STORAGE_KEY = 'mmt.settings.returnScreen';

export interface SettingsReturnScreen {
  /** Path and query of the Project screen. */
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
    // Blocked storage or a damaged value: 全体設定 then offers only the app name, as before.
    return null;
  }
}

export function rememberSettingsReturnScreen(screen: SettingsReturnScreen): void {
  try {
    sessionStorage.setItem(SETTINGS_RETURN_STORAGE_KEY, JSON.stringify(screen));
  } catch {
    /* Leading back is a convenience; the app works without it. */
  }
}
