import type { ComputeTargetVisibility } from '@mmt/contracts';

// 全体設定 → コンピュータ（/settings/computers）の文言。すべてのコンピュータとその公開範囲・状態、
// ProjectのComputeの画面に出す、利用者が使えるコンピュータを読むだけの一覧。
export const computersText = {
  computersHint:
    "Lists every computer. Computers you cannot use (another user's private computers) show only their name, type, owner, visibility, and status.",
  noComputers: 'No computers yet',
  computerDeleted: 'Deleted computer',
  computerKind: 'Type',
  computerOwner: 'Owner',
  computerVisibility: 'Visibility',
  computerUsable: 'Available to me',
  computerUsableYes: 'Available',
  computerUsableNo: 'Unavailable',
  computerEnabled: 'Enabled',
  computerDisabled: 'Disabled',
  computerEnable: 'Enable',
  computerDisable: 'Disable',
  computerLauncherMissing: 'Launcher not configured',
  computerLauncherRevoked: 'Launcher revoked',
  computerLauncherNeverSeen: 'Launcher not responding',
  computerLocation: 'Connection',
  computerVisibilityPublicHint: 'Jobs from any project can run on this computer.',
  computerVisibilityPrivateHint:
    "Only the owner's jobs and jobs from service accounts created by the owner can run here. Hooks, automation, tasks, and sweeps can run only when their owner owns this computer. Global administrators cannot run jobs here unless they are the owner.",
  siteComputerNotice:
    'Add a site (supercomputer, GPU server, or your PC). You become its owner.',
  projectComputersHint:
    'Computers you can use in this project. Add computers and manage their settings, job shells, and keys in Global settings → Computers.',
  openComputerSettings: 'Open Computers in global settings',
  executionScreensHiddenHint:
    'Features that run jobs (Sweeps, Tasks, Code, Workflows, Jobs, Hooks, and model automation and promotion) appear in the sidebar once a computer this project can use is added.',
  computerId: 'Computer ID',
  workerSetupTitle: 'Worker setup',
  workerSetupHint:
    'Jobs on this computer are run by a worker whose --target-ids (MMT_WORKER_TARGET_IDS) include this ID. Run the following commands on the worker machine. For a worker that also handles other computers, list the IDs separated by commas.',
  workerSetupToken:
    "To get the worker's token, create a service account with the Admin role under “Service accounts” in project settings, and issue a token with read, worker:execute, and artifacts:write. The install command prompts for it.",
  workerSetupInstall: 'Install the worker (Python 3.11 or later)',
  workerSetupService: "Run as a systemd service (the worker ID is this machine's hostname)",
  workerSetupEnvironment: 'Run without systemd (environment variables)',
  workerSetupEnvironmentCommands: 'Environment variables (enter the token when running) and worker startup',
} as const;

// 値を埋め込む文言。
export const computersTextTemplates = {
  computerLauncherSeen: (name: string, lastSeen: string) => `${name} (last response: ${lastSeen})`,
  workerSetUpBy: (ownerName: string) => `Set up by the owner (${ownerName}) or a global administrator.`,
};

export const computerVisibilityHints = {
  public: computersText.computerVisibilityPublicHint,
  private: computersText.computerVisibilityPrivateHint,
} satisfies Record<ComputeTargetVisibility, string>;
