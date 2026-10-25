import {
  DEFAULT_SITE_CANCEL_GRACE_SECONDS,
  DEFAULT_SITE_MAX_ACTIVE_SUBMISSIONS,
  DEFAULT_SITE_MAX_OUTPUT_FILES,
  DEFAULT_SITE_RUNNER_PYTHON,
  DEFAULT_SITE_SSH_PORT,
  MAX_KNOWN_HOSTS_BYTES,
  MAX_SITE_ACCOUNT_NAME_LENGTH,
  MAX_SITE_CANCEL_GRACE_SECONDS,
  MAX_SITE_HOST_LENGTH,
  MAX_SITE_JUMP_HOSTS,
  MAX_SITE_MAX_OUTPUT_FILES,
  SITE_ACCOUNT_MODES,
  SITE_ACCOUNT_NAME_PATTERN,
  SITE_CLAIM_MAX_SUBMISSIONS,
  SITE_GPU_ASSIGNMENTS,
  SITE_HOST_PATTERN,
  SITE_JUMP_HOST_PATTERN,
  SITE_PATH_PATTERN,
  SITE_RUNNER_PYTHON_PATTERN,
  type SiteAccountMode,
  type SiteConnection,
  type SiteGpuAssignment,
  type SiteSettings,
} from '@mmt/contracts';
import type { FormValues } from '../types/form';
import { getFieldValue, parseChoice, splitLines } from './formValues';
import { formatSiteVariables, parseSiteVariables } from './siteVariables';
import { LocalizedError } from './localizedError';
import { text } from '../i18n/catalog';
import { siteComputersTextTemplates } from '../i18n/siteComputers';

/** siteの全体設定のすべて。job shellはこれとは別に、新しいバージョンとして保存する。 */
export type SiteSettingsValues = Omit<SiteSettings, 'jobShell'>;

const MAX_PORT = 65535;
const BYTES_PER_KIB = 1024;
// APIの規則（contractsにある形式）。フォームで説明できるよう、ここで先に確かめる。
// known_hostsの行は"<hosts> <key type> <key>"の形で、#で始まる行はコメント。
const KNOWN_HOSTS_LINE_FIELDS = 3;
// スパコンには多くの人が本人のアカウントでログインするので、新しいsiteは本人アカウントで始める。
const DEFAULT_ACCOUNT_MODE: SiteAccountMode = 'personal';
const DEFAULT_GPU_ASSIGNMENT: SiteGpuAssignment = 'scheduler';

/** siteの全体設定のフォームの値。新しいsite（null）はAPIの既定値から始める。 */
export function siteSettingsFormValues(site: SiteSettings | null): FormValues {
  const connection = site?.connection;
  return {
    launcherId: site?.launcherId ?? '',
    siteHost: connection?.host ?? '',
    sitePort: String(connection?.port ?? DEFAULT_SITE_SSH_PORT),
    siteJumpHosts: connection?.jumpHosts.join('\n') ?? '',
    siteKnownHosts: connection?.knownHosts ?? '',
    accountMode: site?.accountMode ?? DEFAULT_ACCOUNT_MODE,
    sharedAccount: site?.sharedAccount ?? '',
    siteWorkDirectory: site?.workDirectory ?? '',
    runnerPython: site?.runnerPython ?? DEFAULT_SITE_RUNNER_PYTHON,
    runnerApiUrl: site?.runnerApiUrl ?? '',
    cancelCommand: site?.cancelCommand ?? '',
    gpuAssignment: site?.gpuAssignment ?? DEFAULT_GPU_ASSIGNMENT,
    leaseGpuIds: site?.leaseGpuIds.join('\n') ?? '',
    siteVariables: formatSiteVariables(site?.variables ?? {}),
    maxActiveSubmissions: String(site?.maxActiveSubmissions ?? DEFAULT_SITE_MAX_ACTIVE_SUBMISSIONS),
    cancelGraceSeconds: String(site?.cancelGraceSeconds ?? DEFAULT_SITE_CANCEL_GRACE_SECONDS),
    maxOutputFiles: String(site?.maxOutputFiles ?? DEFAULT_SITE_MAX_OUTPUT_FILES),
  };
}

/** parseIntegerInRangeで読む欄。エラーの文は、今の表示言語で欄の名前を出す。 */
type IntegerFieldLabel = 'sitePort' | 'maxActiveSubmissions' | 'cancelGraceSeconds' | 'maxOutputFiles';

function parseIntegerInRange({
  value,
  label,
  min,
  max,
}: {
  value: string;
  label: IntegerFieldLabel;
  min: number;
  max: number;
}): number {
  const number = Number(value.trim());
  if (!value.trim() || !Number.isSafeInteger(number) || number < min || number > max)
    throw new LocalizedError(() => siteComputersTextTemplates.siteNumberRangeError(text[label], min, max));
  return number;
}

/** siteの共用アカウント名、または本人のアカウント名。ランチャーはこの名前でログインする。 */
export function parseAccountName(value: string, requiredMessage: string): string {
  const name = value.trim();
  if (!name) throw new Error(requiredMessage);
  if (name.length > MAX_SITE_ACCOUNT_NAME_LENGTH || !SITE_ACCOUNT_NAME_PATTERN.test(name))
    throw new Error(text.siteAccountNameError);
  return name;
}

/** site上のディレクトリの絶対パス。空なら、もう一方の設定（siteか個人）に任せる。 */
export function parseSiteDirectory(value: string): string {
  const directory = value.trim();
  if (directory && !SITE_PATH_PATTERN.test(directory)) throw new Error(text.siteWorkDirectoryError);
  return directory;
}

function parseRunnerPython(value: string): string {
  const runnerPython = value.trim();
  if (!runnerPython) throw new Error(text.required);
  if (!SITE_RUNNER_PYTHON_PATTERN.test(runnerPython)) throw new Error(text.runnerPythonError);
  return runnerPython;
}

function parseRunnerApiUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(text.runnerApiUrlError);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error(text.runnerApiUrlError);
  return trimmed;
}

function parseKnownHosts(value: string): string {
  const knownHosts = value.trim();
  if (!knownHosts) throw new Error(text.siteKnownHostsRequired);
  const entries = knownHosts
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  if (entries.some((line) => line.split(/\s+/).length < KNOWN_HOSTS_LINE_FIELDS))
    throw new Error(text.siteKnownHostsLineError);
  const stored = `${knownHosts}\n`;
  if (new TextEncoder().encode(stored).length > MAX_KNOWN_HOSTS_BYTES)
    throw new LocalizedError(() =>
      siteComputersTextTemplates.siteKnownHostsTooLarge(MAX_KNOWN_HOSTS_BYTES / BYTES_PER_KIB),
    );
  return stored;
}

function parseConnection(values: FormValues): SiteConnection {
  const host = getFieldValue(values, 'siteHost').trim();
  if (host.length > MAX_SITE_HOST_LENGTH || !SITE_HOST_PATTERN.test(host) || host.startsWith('-'))
    throw new Error(text.siteHostError);
  const jumpHosts = splitLines(getFieldValue(values, 'siteJumpHosts'));
  const invalidJumpHost = jumpHosts.find((jumpHost) => !SITE_JUMP_HOST_PATTERN.test(jumpHost));
  if (invalidJumpHost !== undefined)
    throw new LocalizedError(() => siteComputersTextTemplates.siteJumpHostError(invalidJumpHost));
  if (jumpHosts.length > MAX_SITE_JUMP_HOSTS)
    throw new LocalizedError(() => siteComputersTextTemplates.siteJumpHostsTooMany(MAX_SITE_JUMP_HOSTS));
  return {
    host,
    port: parseIntegerInRange({ value: getFieldValue(values, 'sitePort'), label: 'sitePort', min: 1, max: MAX_PORT }),
    jumpHosts,
    knownHosts: parseKnownHosts(getFieldValue(values, 'siteKnownHosts')),
  };
}

function parseLauncherId(values: FormValues): string {
  const launcherId = getFieldValue(values, 'launcherId');
  if (!launcherId) throw new Error(text.siteLauncherRequired);
  return launcherId;
}

/**
 * フォームから作るsiteの全体設定。自動投入のsiteには、投入するランチャーとそのログイン先が要る。
 * 手動投入のsiteにはどちらも無く、共用アカウントも無い。`mado-tracking submit`を実行した人が
 * 本人として投入するため。共用アカウントは、全員のJobをsite自身の作業ディレクトリで動かす。
 * runnerが選べるGPUを持つのは、スケジューラの無いホスト（gpuAssignment 'lease'）だけ。
 */
export function buildSiteSettingsInput(values: FormValues): SiteSettingsValues {
  const isAutomatic = getFieldValue(values, 'submissionMode') === 'automatic';
  const accountMode = isAutomatic
    ? parseChoice(getFieldValue(values, 'accountMode'), SITE_ACCOUNT_MODES)
    : 'personal';
  const gpuAssignment = parseChoice(getFieldValue(values, 'gpuAssignment'), SITE_GPU_ASSIGNMENTS);
  const workDirectory = parseSiteDirectory(getFieldValue(values, 'siteWorkDirectory'));
  if (accountMode === 'shared' && !workDirectory) throw new Error(text.siteWorkDirectoryRequired);
  return {
    launcherId: isAutomatic ? parseLauncherId(values) : null,
    connection: isAutomatic ? parseConnection(values) : null,
    accountMode,
    sharedAccount:
      accountMode === 'shared'
        ? parseAccountName(getFieldValue(values, 'sharedAccount'), text.siteSharedAccountRequired)
        : '',
    workDirectory,
    runnerPython: parseRunnerPython(getFieldValue(values, 'runnerPython')),
    runnerApiUrl: parseRunnerApiUrl(getFieldValue(values, 'runnerApiUrl')),
    cancelCommand: getFieldValue(values, 'cancelCommand').trim() || null,
    gpuAssignment,
    leaseGpuIds: gpuAssignment === 'lease' ? splitLines(getFieldValue(values, 'leaseGpuIds')) : [],
    variables: parseSiteVariables(getFieldValue(values, 'siteVariables')),
    maxActiveSubmissions: parseIntegerInRange({
      value: getFieldValue(values, 'maxActiveSubmissions'),
      label: 'maxActiveSubmissions',
      min: 1,
      max: SITE_CLAIM_MAX_SUBMISSIONS,
    }),
    cancelGraceSeconds: parseIntegerInRange({
      value: getFieldValue(values, 'cancelGraceSeconds'),
      label: 'cancelGraceSeconds',
      min: 1,
      max: MAX_SITE_CANCEL_GRACE_SECONDS,
    }),
    maxOutputFiles: parseIntegerInRange({
      value: getFieldValue(values, 'maxOutputFiles'),
      label: 'maxOutputFiles',
      min: 1,
      max: MAX_SITE_MAX_OUTPUT_FILES,
    }),
  };
}
