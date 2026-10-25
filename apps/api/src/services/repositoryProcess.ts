import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { DomainError } from '../domain/errors.js';

// Poll downloads as they grow, including temporary packfiles that git has not renamed yet.
const DIRECTORY_CHECK_INTERVAL_MS = 100;
// Bound metadata work too, so a repository with many loose objects cannot stall the monitor.
const MAX_DIRECTORY_ENTRIES = 20_000;

export interface RepositoryCommand {
  executable: string;
  arguments: string[];
  directory: string;
  environment: NodeJS.ProcessEnv;
  timeoutMs: number;
  maxOutputBytes: number;
  maxDirectoryBytes: number;
  stdin?: Buffer;
}
export type RepositoryCommandRunner = (command: RepositoryCommand) => Promise<Buffer>;

function repositoryTimeoutError(): DomainError {
  return new DomainError({
    status: 502,
    code: 'repository_timeout',
    message: 'reading the repository timed out',
  });
}

async function validateDirectorySize(
  directory: string,
  maxBytes: number,
  deadlineAt: number,
): Promise<void> {
  const directories = [directory];
  let bytes = 0;
  let entries = 0;
  while (directories.length) {
    const current = directories.pop()!;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (Date.now() >= deadlineAt) throw repositoryTimeoutError();
      if (++entries > MAX_DIRECTORY_ENTRIES)
        throw new DomainError({
          status: 413,
          code: 'repository_too_large',
          message: 'the repository has more files than the limit',
        });
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        directories.push(entryPath);
        continue;
      }
      try {
        bytes += (await stat(entryPath)).size;
      } catch (error) {
        // Git can rename packfiles between readdir and stat.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (bytes > maxBytes)
        throw new DomainError({
          status: 413,
          code: 'repository_too_large',
          message: 'the repository download exceeds the size limit',
        });
    }
  }
}

export const runRepositoryCommand: RepositoryCommandRunner = async (command) => {
  if (command.timeoutMs <= 0) throw repositoryTimeoutError();
  const deadlineAt = Date.now() + command.timeoutMs;
  const child = spawn(command.executable, command.arguments, {
    cwd: command.directory,
    env: command.environment,
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });
  const chunks: Buffer[] = [];
  let outputBytes = 0;
  let failure: DomainError | undefined;
  let directoryInspection: Promise<void> | undefined;
  let isClosed = false;
  const terminate = (error: DomainError): void => {
    failure ??= error;
    if (!child.pid || isClosed) return;
    try {
      // Kill git and its SSH/HTTP descendants before cleaning up their shared workspace.
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill('SIGKILL');
    }
  };
  const deadline = setTimeout(() => terminate(repositoryTimeoutError()), command.timeoutMs);
  const monitor = setInterval(() => {
    if (directoryInspection || failure || isClosed) return;
    directoryInspection = validateDirectorySize(
      command.directory,
      command.maxDirectoryBytes,
      deadlineAt,
    )
      .catch((error: unknown) =>
        terminate(
          error instanceof DomainError
            ? error
            : new DomainError({
              status: 502,
              code: 'repository_read_failed',
              message: 'cannot check the repository download size',
            }),
        ),
      )
      .finally(() => {
        directoryInspection = undefined;
      });
  }, DIRECTORY_CHECK_INTERVAL_MS);
  child.stdout.on('data', (chunk: Buffer) => {
    outputBytes += chunk.length;
    if (outputBytes > command.maxOutputBytes) {
      terminate(
        new DomainError({
          status: 413,
          code: 'repository_too_large',
          message: 'the repository read exceeds the size limit',
        }),
      );
      return;
    }
    if (!failure) chunks.push(chunk);
  });
  // Provider errors can contain remote URLs or secrets. Drain stderr without retaining it.
  child.stderr.resume();
  child.stdin.on('error', () => undefined);
  child.stdin.end(command.stdin);
  try {
    const exitCode = await new Promise<number | null>((resolve) => {
      child.once('error', () => {
        failure ??= new DomainError({
          status: 502,
          code: 'repository_read_failed',
          message: 'cannot read the repository',
        });
      });
      child.once('close', (code) => {
        isClosed = true;
        resolve(code);
      });
    });
    await directoryInspection;
    if (failure) throw failure;
    if (exitCode !== 0)
      throw new DomainError({
        status: 502,
        code: 'repository_read_failed',
        message: 'cannot read the pinned commit of the repository',
      });
    await validateDirectorySize(command.directory, command.maxDirectoryBytes, deadlineAt);
    if (failure) throw failure;
    return Buffer.concat(chunks, outputBytes);
  } finally {
    clearTimeout(deadline);
    clearInterval(monitor);
    await directoryInspection;
  }
};
