import * as english from './en/computers';
import { localized } from './localized';
import type { ComputeTargetVisibility } from '@mmt/contracts';

// 全体設定 → コンピュータ (/settings/computers): every computer with its visibility and state, and
// the read-only list of the computers one may use on the Project's Compute page.
export const computersText = localized({
  computersHint:
    'すべてのコンピュータが出ます。自分が使えないもの（他の人のPrivate）は、名前・種類・所有者・公開範囲・状態だけを出します。',
  noComputers: 'コンピュータはまだありません',
  // When the computer of a Job, Task, hook or automation rule is no longer in the list of all computers.
  computerDeleted: '削除されたコンピュータ',
  computerKind: '種類',
  computerOwner: '所有者',
  computerVisibility: '公開範囲',
  computerUsable: '自分が使えるか',
  computerUsableYes: '使える',
  computerUsableNo: '使えない',
  computerEnabled: '有効',
  computerDisabled: '無効',
  computerEnable: '有効にする',
  computerDisable: '無効にする',
  computerLauncherMissing: 'ランチャー未設定',
  computerLauncherRevoked: 'ランチャーは失効',
  computerLauncherNeverSeen: 'ランチャーの応答なし',
  computerLocation: '接続先',
  computerVisibilityPublicHint: 'どのプロジェクトのJobも、このコンピュータで動かせます。',
  computerVisibilityPrivateHint:
    '所有者と、所有者が作ったService AccountのJobだけが動きます。フック・自動実行・Task・Sweepも、それらの所有者がこのコンピュータの所有者のときだけ動きます。全体管理者も、所有者でなければ動かせません。',
  ownerlessComputerVisibilityNotice:
    'このコンピュータには所有者がいないので、Publicのままです（Privateにはできません）。',
  siteComputerNotice:
    'site（スパコン・GPUサーバー・自分のPCなど）を追加します。追加した人が所有者になります。',
  projectComputersHint:
    'このプロジェクトで自分が使えるコンピュータです。追加・設定・job shell・鍵は、全体設定の「コンピュータ」で扱います。',
  openComputerSettings: '全体設定の「コンピュータ」を開く',
  computerId: 'コンピュータID',
  // A computer's details: the worker that takes its Jobs, with the computer's ID filled in.
  workerSetupTitle: 'workerの設定',
  workerSetupHint:
    'このコンピュータのJobは、このIDを--target-ids（MMT_WORKER_TARGET_IDS）に含むworkerが実行します。workerのマシンで次のコマンドを実行します。ほかのコンピュータも受け持つworkerでは、IDをカンマで区切って並べます。',
  workerSetupToken:
    'workerのtokenは、プロジェクト設定の［Service Accounts］でRoleがAdminのService Accountを作り、read・worker:execute・artifacts:writeを選んで発行します。installの途中で入力を求められます。',
  workerSetupInstall: 'workerを入れる（Python 3.11以上）',
  workerSetupService: 'systemdで常駐させる（worker IDはこのマシンのホスト名）',
  workerSetupEnvironment: 'systemdを使わずに動かす（環境変数）',
  workerSetupEnvironmentCommands: '環境変数（tokenは実行時に入力）とworkerの起動',
} as const, english.computersText);

// Text that embeds values.
export const computersTextTemplates = localized({
  computerLauncherSeen: (name: string, lastSeen: string) => `${name}（最終応答 ${lastSeen}）`,
  // The「workerの設定」row for those who may not manage the computer. Without an owner (a computer
  // from before owners), only global administrators manage it.
  workerSetUpBy: (ownerName: string | null) =>
    ownerName ? `所有者（${ownerName}さん）か全体管理者が設定します。` : '全体管理者が設定します。',
}, english.computersTextTemplates);

export const computerVisibilityHints = localized({
  get public() { return computersText.computerVisibilityPublicHint; },
  get private() { return computersText.computerVisibilityPrivateHint; },
} satisfies Record<ComputeTargetVisibility, string>, english.computerVisibilityHints);
