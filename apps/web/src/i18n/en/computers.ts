import type { ComputeTargetVisibility } from '@mmt/contracts';

// 全体設定 → コンピュータ (/settings/computers): every computer with its visibility and state, and
// the read-only list of the computers one may use on the Project's Compute page.
export const computersText = {
  computersHint:
    "Lists every computer. Computers you cannot use (another user's private computers) show only their name, kind, owner, visibility, and status.",
  noComputers: "No computers yet",
  computerKind: "Type",
  computerOwner: "Owner",
  computerVisibility: "Visibility",
  computerState: "Status",
  computerUsable: "Available to me",
  computerUsableYes: "Available",
  computerUsableNo: "Unavailable",
  computerEnabled: "Enabled",
  computerDisabled: "Disabled",
  computerEnable: "Enable",
  computerDisable: "Disable",
  computerLauncherMissing: "Launcher not configured",
  computerLauncherRevoked: "Launcher revoked",
  computerLauncherNeverSeen: "Launcher not responding",
  computerLocation: "Connection",
  computerVisibilityPublicHint: "Jobs from any project can run on this computer.",
  computerVisibilityPrivateHint:
    "Only the owner's jobs and jobs from service accounts created by the owner can run here. Hooks, automation, tasks, and sweeps can run only when their owner owns this computer. Global administrators cannot run jobs here unless they are the owner.",
  ownerlessComputerVisibilityNotice:
    "This computer has no owner and remains public. It cannot be made private.",
  siteComputerNotice:
    "Add a site (supercomputer, GPU server, or your PC). You become its owner.",
  projectComputersHint:
    "Computers you can use in this project. Add computers and manage their settings, job shells, and keys in Global settings → Computers.",
  openComputerSettings: "Open Computers in global settings",
  computerId: "Computer ID",
  workerSetupTitle: "Worker setup",
  workerSetupHint:
    "Jobs on this computer are run by a worker whose --target-ids (MMT_WORKER_TARGET_IDS) include this ID. Run the following commands on the worker machine. For a worker that also handles other computers, list the IDs separated by commas.",
  workerSetupToken:
    "To get the worker's token, create a service account with the admin role under “Service accounts” in project settings, and issue a token with read, worker:execute, and artifacts:write. The install command prompts for it.",
  workerSetupInstall: "Install the worker (Python 3.11 or later)",
  workerSetupService: "Run as a systemd service (the worker ID is this machine's hostname)",
  workerSetupEnvironment: "Run without systemd (environment variables)",
  workerSetupEnvironmentCommands: "Environment variables (enter the token when running) and worker startup",
} as const;

// Text that embeds values.
export const computersTextTemplates = {
  computerLauncherSeen: (name: string, lastSeen: string) => `${name} (last response: ${lastSeen})`,
  workerSetUpBy: (ownerName: string | null) =>
    ownerName
      ? `Set up by the owner (${ownerName}) or a global administrator.`
      : "Set up by a global administrator.",
};

export const computerVisibilityHints = {
  public: computersText.computerVisibilityPublicHint,
  private: computersText.computerVisibilityPrivateHint,
} satisfies Record<ComputeTargetVisibility, string>;
