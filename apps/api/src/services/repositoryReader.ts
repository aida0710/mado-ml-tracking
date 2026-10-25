import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { RepositoryFiles } from '@mmt/contracts';
import type { ApiConfig } from '../config.js';
import { MAX_CODE_FILES, MAX_CODE_TEXT_BYTES } from '../domain/codeSourceValidation.js';
import {
  repositoryFilesSchema,
  type RepositoryFilesRequest,
} from '../domain/codeSourceValidation.js';
import { DomainError } from '../domain/errors.js';
import {
  decodeRepositoryBlobs,
  parseRepositoryTree,
  selectRepositoryBlobs,
} from '../domain/repositoryObjects.js';
import { runRepositoryCommand, type RepositoryCommandRunner } from './repositoryProcess.js';

// editorの1回のリクエストはすぐに終わらなければならず、ディスクやメモリを際限なく使ってはならない。
const REPOSITORY_TIMEOUT_MS = 30_000;
const MAX_REPOSITORY_BYTES = 64 * 1024 * 1024;
const MAX_TREE_BYTES = 2 * 1024 * 1024;
const MAX_GIT_METADATA_BYTES = 4096;
// batchのヘッダーはそれぞれ、オブジェクトID、大きさ、種類、改行を含む。1ファイルあたり
// 128バイトまで認める。
const MAX_BATCH_HEADER_BYTES = 128 * MAX_CODE_FILES;

const isolatedGitArguments = [
  '-c',
  'protocol.allow=never',
  '-c',
  'protocol.https.allow=always',
  '-c',
  'protocol.ssh.allow=always',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'core.askPass=/bin/false',
  '-c',
  'credential.helper=',
  '-c',
  'credential.interactive=false',
  '-c',
  'http.followRedirects=false',
  '-c',
  'http.proxy=',
  '-c',
  'http.extraHeader=',
  '-c',
  'http.cookieFile=',
  '-c',
  'http.saveCookies=false',
  '-c',
  'http.sslVerify=true',
  '-c',
  'fetch.fsckObjects=true',
  '-c',
  'transfer.fsckObjects=true',
  '-c',
  'gc.auto=0',
  '-c',
  'maintenance.auto=false',
];
const isolatedSshArguments = [
  '/usr/bin/ssh',
  '-F',
  '/dev/null',
  '-oBatchMode=yes',
  '-oStrictHostKeyChecking=yes',
  '-oGlobalKnownHostsFile=/dev/null',
  '-oIdentityAgent=none',
  '-oIdentitiesOnly=yes',
  '-oPasswordAuthentication=no',
  '-oKbdInteractiveAuthentication=no',
  '-oProxyCommand=none',
  '-oProxyJump=none',
  '-oControlMaster=no',
  '-oControlPath=none',
  '-oPermitLocalCommand=no',
  '-oClearAllForwardings=yes',
];

function repositorySshCommand(settings: ApiConfig['repositorySsh']): string {
  const arguments_ = [
    ...isolatedSshArguments,
    `-oUserKnownHostsFile="${(settings?.knownHostsPath ?? '/dev/null').replace(/["\\]/g, '\\$&')}"`,
    // IdentityFileは、設定したファイルが無いときに既定の鍵を使わせない働きもする。
    `-oIdentityFile="${(settings?.keyPath ?? 'none').replace(/["\\]/g, '\\$&')}"`,
    `-oPreferredAuthentications=${settings ? 'publickey' : 'none'}`,
  ];
  // gitはこの運用者だけが設定するコマンドをシェルに渡すので、パスも含めすべての引数をクォートする。
  return arguments_.map((argument) => `'${argument.replaceAll("'", "'\\''")}'`).join(' ');
}

export type RepositoryReader = (request: RepositoryFilesRequest) => Promise<RepositoryFiles>;

export class GitRepositoryReader {
  private readonly execute: RepositoryCommandRunner;
  private readonly ssh: ApiConfig['repositorySsh'];
  constructor(
    options: { execute?: RepositoryCommandRunner; ssh?: ApiConfig['repositorySsh'] } = {},
  ) {
    this.execute = options.execute ?? runRepositoryCommand;
    this.ssh = options.ssh ?? null;
  }

  async read(input: RepositoryFilesRequest): Promise<RepositoryFiles> {
    // HTTPを通らない呼び出し元も検証する。リポジトリのURLを決してコマンドのオプションにしない。
    const parsed = repositoryFilesSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError({
        status: 422,
        code: 'invalid_repository',
        message: 'invalid repository URL or commit',
      });
    const request = parsed.data;
    const directory = await mkdtemp(path.join(tmpdir(), 'mmt-repository-'));
    const deadline = Date.now() + REPOSITORY_TIMEOUT_MS;
    // 子プロセスの環境変数は新しく組み立てる。token、SSHエージェント、Gitの設定、HTTPのヘルパーは
    // 決して引き継がない。
    const environment: NodeJS.ProcessEnv = {
      PATH: '/usr/bin:/bin',
      HOME: directory,
      XDG_CONFIG_HOME: directory,
      TMPDIR: directory,
      LANG: 'C',
      LC_ALL: 'C',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_COUNT: '0',
      GIT_ATTR_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '/bin/false',
      SSH_ASKPASS: '/bin/false',
      SSH_ASKPASS_REQUIRE: 'never',
      GCM_INTERACTIVE: 'never',
      GIT_SSH_COMMAND: repositorySshCommand(this.ssh),
      GIT_SSH_VARIANT: 'ssh',
    };
    const git = (arguments_: string[], maxOutputBytes = MAX_GIT_METADATA_BYTES, stdin?: Buffer) =>
      this.execute({
        executable: '/usr/bin/git',
        arguments: [...isolatedGitArguments, ...arguments_],
        directory,
        environment,
        timeoutMs: deadline - Date.now(),
        maxOutputBytes,
        maxDirectoryBytes: MAX_REPOSITORY_BYTES,
        stdin,
      });
    try {
      await git([
        'init',
        '--bare',
        '--template=',
        ...(request.commit.length === 64 ? ['--object-format=sha256'] : []),
      ]);
      await git([
        'fetch',
        '--quiet',
        '--no-tags',
        '--depth=1',
        '--no-recurse-submodules',
        '--',
        request.url,
        request.commit,
      ]);
      const commit = (await git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']))
        .toString('ascii')
        .trim();
      if (commit !== request.commit)
        throw new DomainError({
          status: 422,
          code: 'repository_commit_mismatch',
          message: 'the repository commit does not match the specified one',
        });
      const tree = await git(['ls-tree', '-r', '-t', '-l', '-z', commit], MAX_TREE_BYTES);
      const { selected, omittedPaths } = selectRepositoryBlobs(parseRepositoryTree(tree));
      const contents = selected.length
        ? await git(
            ['cat-file', '--batch'],
            MAX_CODE_TEXT_BYTES + MAX_BATCH_HEADER_BYTES,
            Buffer.from(selected.map((blob) => blob.objectId).join('\n') + '\n'),
          )
        : Buffer.alloc(0);
      return decodeRepositoryBlobs({ commit, selected, omittedPaths, contents });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError({
        status: 502,
        code: 'repository_read_failed',
        message: 'cannot read the repository',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
