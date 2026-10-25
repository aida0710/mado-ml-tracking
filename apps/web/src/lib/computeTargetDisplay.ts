import type {
  ComputeTarget,
  ComputeTargetDetails,
  TargetCheckHost,
  TargetCheckItemName,
} from '@mmt/contracts';
import { formatBytes } from './format';
import { text, textTemplates } from '../i18n/catalog';
import {
  computeTargetExecutorLabels,
  submissionModeBadgeLabels,
  targetCheckItemLabels,
} from '../i18n/compute';
import { formatList, formatNote } from '../i18n/textJoining';

// コンピュータについて出すものが無いところに出す（接続先が無い、確認で分かったことが無い）。
const NO_VALUE = '—';

/**
 * コンピュータの表に出す、そのコンピュータがJobを実行する場所。localのコンピュータはworker自身の
 * ホストで動くので、保存されたホストとポート（フォームの既定値の127.0.0.1:22）をSSHとしては
 * 出さない。siteには設定の接続先でつなぎ、それを見られるのは所有者と全体管理者だけ。手動の
 * siteには接続先が無く、要求した人がそれぞれ自分で投入する。
 */
export function formatTargetLocation(
  target: Pick<ComputeTargetDetails, 'executor' | 'host' | 'port' | 'username' | 'site'>,
): string {
  if (target.executor === 'local') return text.targetLocationLocal;
  if (target.executor === 'site') {
    const connection = target.site?.connection;
    if (!connection) return NO_VALUE;
    const account = target.site?.accountMode === 'shared' ? `${target.site.sharedAccount}@` : '';
    return `${account}${connection.host}:${connection.port}`;
  }
  return target.host ? `${target.username}@${target.host}:${target.port}` : NO_VALUE;
}

/** 選択肢に出すコンピュータ。名前と実行する場所。 */
export function targetChoiceLabel(
  target: Pick<ComputeTarget, 'name' | 'executor' | 'host' | 'submissionMode'>,
): string {
  // localのコンピュータはworkerのホストで動き、自分のホストを持たないことがある。
  if (target.executor === 'local') return `${target.name} · ${text.targetLocationLocal}`;
  // コンピュータを管理できない人にはホストを隠す。そのときは名前だけを出す。
  if (target.executor !== 'site') return target.host ? `${target.name} · ${target.host}` : target.name;
  const mode = submissionModeBadgeLabels[target.submissionMode];
  return `${target.name} · ${computeTargetExecutorLabels.site}${formatNote(mode)}`;
}

/** コンピュータが出すGPU。GPUのIDか、siteならJobごとに求める数。 */
export function formatTargetGpus(target: Pick<ComputeTarget, 'executor' | 'gpuIds'>): string {
  if (target.executor === 'site') return text.targetGpuPerJob;
  return formatList(target.gpuIds) || text.cpuOnly;
}

/**
 * workerがsshやlocalのコンピュータにどうつなぐか。接続の確認の結果の上に書く文。
 * siteは代わりにランチャーが確認する（SiteConnectionChecks）。
 */
export function targetCheckHintFor(executor: ComputeTarget['executor']): string {
  return executor === 'local' ? text.targetCheckHintLocal : text.targetCheckHint;
}

/** 確認の最初の項目はSSHの接続。localのコンピュータではコマンドの起動。 */
export function targetCheckItemLabel(
  name: TargetCheckItemName,
  executor: ComputeTarget['executor'],
): string {
  if (name === 'connection' && executor === 'local') return text.targetCheckLocalConnection;
  return targetCheckItemLabels[name];
}

/** 確認が届いたマシンを1行で出す。`uname -m`、コア数、メモリ量を、分かった範囲で。 */
export function formatCheckedHost(host: TargetCheckHost): string {
  const facts = [
    host.machine,
    host.cpuCount === null ? null : textTemplates.cpuCount(host.cpuCount),
    host.memoryTotalBytes === null ? null : formatBytes(host.memoryTotalBytes),
  ].filter((fact) => fact !== null);
  return facts.length ? textTemplates.hostFactsSummary(facts) : NO_VALUE;
}
