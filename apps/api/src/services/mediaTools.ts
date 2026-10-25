import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

/** ffprobeかffmpegが入っていない。失敗にせず、プレビューを作らずに済ませる。 */
export class MediaToolUnavailableError extends Error {
  override readonly name = 'MediaToolUnavailableError';
}

/** ツールが0以外で終わった、タイムアウトで止められた、または使えない出力を出した。 */
export class MediaToolFailedError extends Error {
  override readonly name = 'MediaToolFailedError';
  constructor(readonly reason: 'exit' | 'timeout' | 'output') {
    super(reason);
  }
}

export interface MediaToolRun {
  /** 実行ファイルの名前か絶対パス。引数はargvとして渡し、シェルは決して通さない。 */
  command: string;
  args: readonly string[];
  timeoutMs: number;
  /** stdoutをチャンクごとに受け取る。無ければstdoutを集めて返す（maxOutputBytesまで）。 */
  onStdout?: (chunk: Buffer) => void;
  maxOutputBytes?: number;
}

// ストリームやチャプターの多いファイルでも、ffprobeのJSONはこれを十分に下回る。
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

/**
 * ffprobe/ffmpegを動かし、終了コードが0なら集めたstdoutで解決する。stderrは捨てる。ファイルの
 * パスやコンテナのメタデータを繰り返し含み、それらをログやDBに届けてはならないため。
 */
export function runMediaTool(run: MediaToolRun): Promise<Buffer> {
  const maxOutputBytes = run.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(run.command, run.args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      reject(new MediaToolUnavailableError(run.command));
      return;
    }
    const chunks: Buffer[] = [];
    let collected = 0;
    let failure: Error | null = null;
    const fail = (error: Error) => {
      failure ??= error;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => fail(new MediaToolFailedError('timeout')), run.timeoutMs);
    child.stdin.end();
    child.stderr.resume();
    child.stdout.on('data', (chunk: Buffer) => {
      if (run.onStdout) {
        try {
          run.onStdout(chunk);
        } catch (error) {
          fail(error as Error);
        }
        return;
      }
      collected += chunk.length;
      if (collected > maxOutputBytes) fail(new MediaToolFailedError('output'));
      else chunks.push(chunk);
    });
    child.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        error.code === 'ENOENT' || error.code === 'EACCES'
          ? new MediaToolUnavailableError(run.command)
          : error,
      );
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0) reject(new MediaToolFailedError('exit'));
      else resolve(Buffer.concat(chunks));
    });
  });
}
