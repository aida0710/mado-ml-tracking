import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Artifact, ArtifactPreviewKind } from '@mmt/contracts';
import type { ArtifactStores } from '@mmt/platform';
import { transaction, type Database } from '../db/database.js';
import { projectArtifactBackend, registerStoredArtifact } from './artifactRegistration.js';
import {
  claimNextPreviewJob,
  markPreviewFinished,
  markPreviewReady,
  retryPreviewLater,
  type PreviewJob,
} from './artifactPreviewQueue.js';
import { probeMediaFile, type MediaProbe } from './mediaProbe.js';
import { MediaToolFailedError, MediaToolUnavailableError } from './mediaTools.js';
import { renderAudioPreviews, renderVideoPoster } from './previewRenderer.js';

export interface PreviewTools {
  ffmpegPath: string;
  ffprobePath: string;
  /** ffprobe・ffmpegの1回の実行にかけられる時間の上限。 */
  timeoutMs: number;
}

interface PreviewFile {
  fileName: string;
  mimeType: string;
  body: Buffer;
}

/** プレビューがファイルを作らずに終わった理由。artifact_previews.errorに保存する。 */
type PreviewFailure =
  | {
      status: 'skipped';
      error: 'ffmpeg_unavailable' | 'no_audio_stream' | 'no_video_stream' | 'source_too_large';
    }
  | { status: 'failed'; error: 'probe_failed' | 'render_failed' | 'render_timeout' };

/** claimを失ったのはエラーではない。新しいclaimが行を持つので、この結果は捨てる。 */
class PreviewClaimLostError extends Error {
  override readonly name = 'PreviewClaimLostError';
}

const AUDIO_KINDS: ReadonlySet<ArtifactPreviewKind> = new Set(['waveform-peaks', 'spectrogram']);

function toolFailure(error: unknown, stage: 'probe' | 'render'): PreviewFailure {
  if (error instanceof MediaToolUnavailableError)
    return { status: 'skipped', error: 'ffmpeg_unavailable' };
  if (stage === 'probe') return { status: 'failed', error: 'probe_failed' };
  if (error instanceof MediaToolFailedError && error.reason === 'timeout')
    return { status: 'failed', error: 'render_timeout' };
  return { status: 'failed', error: 'render_failed' };
}

function logPreviewEvent(event: string, details: Record<string, unknown>): void {
  // ツールの出力と保存場所はログに出さない。ファイルはArtifactのidで特定できる。
  console.error(JSON.stringify({ event, ...details }));
}

/**
 * 1つのArtifactについて、claimしたプレビューを作る。専用の一時ディレクトリにダウンロードし、
 * ffprobeで調べ、ヘッダーの読み取りでは分からなかったメディア情報を記録し、種類ごとに描画して、
 * 結果をRunの無いArtifactとして保存する。元のArtifactは決して変えない。
 */
export class ArtifactPreviewProcessor {
  constructor(
    private readonly options: {
      database: Database;
      stores: ArtifactStores;
      tools: PreviewTools;
      /** 処理ごとの一時ディレクトリの親。最大の元ファイルが入る空きが要る。 */
      workDirectory: string;
      /** これより大きい元ファイルは、workDirectoryにダウンロードせずに飛ばす。 */
      maxSourceBytes: number;
    },
  ) {}

  /** 1つのArtifactのプレビューを処理する。キューが空ならfalse。 */
  async processNext(): Promise<boolean> {
    // claimの前に作り、作業ディレクトリが使えなくても'running'のまま止まる行を残さない。
    const directory = await mkdtemp(path.join(this.options.workDirectory, 'mmt-preview-'));
    try {
      const job = await claimNextPreviewJob(this.options.database);
      if (!job) return false;
      await this.process(job, path.join(directory, 'source'));
      return true;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async process(job: PreviewJob, sourcePath: string): Promise<void> {
    if (job.artifact.size > this.options.maxSourceBytes) {
      await this.finishAll(job, { status: 'skipped', error: 'source_too_large' });
      return;
    }
    try {
      await this.download(job.artifact, sourcePath);
    } catch (error) {
      logPreviewEvent('artifact_preview_source_unreadable', { artifactId: job.artifact.id, name: (error as Error).name });
      for (const [kind, attempts] of job.attempts)
        await retryPreviewLater(this.options.database, { artifactId: job.artifact.id, kind, attempts, error: 'source_unreadable' });
      return;
    }
    let probe: MediaProbe;
    try {
      probe = await probeMediaFile({
        ffprobePath: this.options.tools.ffprobePath,
        filePath: sourcePath,
        timeoutMs: this.options.tools.timeoutMs,
      });
    } catch (error) {
      await this.finishAll(job, toolFailure(error, 'probe'));
      return;
    }
    await this.recordMediaInfo(job.artifact, probe);
    const audioKinds = [...job.attempts.keys()].filter((kind) => AUDIO_KINDS.has(kind));
    if (audioKinds.length > 0) await this.renderAudio(job, { sourcePath, probe, kinds: audioKinds });
    if (job.attempts.has('video-poster')) await this.renderPoster(job, { sourcePath, probe });
  }

  private async renderAudio(
    job: PreviewJob,
    input: { sourcePath: string; probe: MediaProbe; kinds: ArtifactPreviewKind[] },
  ): Promise<void> {
    if (!input.probe.audio) {
      await this.finishKinds(job, input.kinds, { status: 'skipped', error: 'no_audio_stream' });
      return;
    }
    let files: Map<ArtifactPreviewKind, PreviewFile>;
    try {
      const previews = await renderAudioPreviews({
        tools: this.options.tools,
        filePath: input.sourcePath,
        sampleRate: input.probe.audio.sampleRate,
      });
      files = new Map([
        ['waveform-peaks', { fileName: 'waveform-peaks.json', mimeType: 'application/json', body: Buffer.from(JSON.stringify(previews.peaks)) }],
        ['spectrogram', { fileName: 'spectrogram.png', mimeType: 'image/png', body: previews.spectrogramPng }],
      ]);
    } catch (error) {
      await this.finishKinds(job, input.kinds, toolFailure(error, 'render'));
      return;
    }
    for (const kind of input.kinds) await this.storePreview(job, kind, files.get(kind)!);
  }

  private async renderPoster(job: PreviewJob, input: { sourcePath: string; probe: MediaProbe }): Promise<void> {
    const video = input.probe.video;
    if (!video) {
      await this.finishKinds(job, ['video-poster'], { status: 'skipped', error: 'no_video_stream' });
      return;
    }
    let poster: Buffer;
    try {
      poster = await renderVideoPoster({
        tools: this.options.tools,
        filePath: input.sourcePath,
        durationSeconds: input.probe.durationSeconds,
        width: video.width,
      });
    } catch (error) {
      await this.finishKinds(job, ['video-poster'], toolFailure(error, 'render'));
      return;
    }
    await this.storePreview(job, 'video-poster', { fileName: 'poster.png', mimeType: 'image/png', body: poster });
  }

  private async download(artifact: Artifact, destination: string): Promise<void> {
    const content = await this.options.stores.read({ backend: artifact.backend, key: artifact.storageKey });
    await pipeline(content.body, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
  }

  /**
   * 登録時のヘッダーの読み取りでは読めない形式について、メディア情報を埋める。ヘッダーから作った
   * 行が既にあればそれを残す。ON CONFLICT DO NOTHINGは上書きしない。
   */
  private async recordMediaInfo(artifact: Artifact, probe: MediaProbe): Promise<void> {
    if (!probe.audio || probe.durationSeconds === null) return;
    try {
      await this.options.database.query(
        `INSERT INTO artifact_media_info(artifact_id,project_id,duration_seconds,sample_rate,channels,
          bits_per_sample,codec,source) VALUES($1,$2,$3,$4,$5,$6,$7,'ffprobe')
         ON CONFLICT (artifact_id) DO NOTHING`,
        [
          artifact.id,
          artifact.projectId,
          probe.durationSeconds,
          probe.audio.sampleRate,
          probe.audio.channels,
          probe.audio.bitsPerSample,
          probe.audio.codec,
        ],
      );
    } catch (error) {
      logPreviewEvent('artifact_media_info_failed', { artifactId: artifact.id, name: (error as Error).name });
    }
  }

  /** ファイルを書いてから、1つのトランザクションでそれを登録し、プレビューをreadyにする。 */
  private async storePreview(job: PreviewJob, kind: ArtifactPreviewKind, file: PreviewFile): Promise<void> {
    const { database, stores } = this.options;
    const source = job.artifact;
    const outcome = { artifactId: source.id, kind, attempts: job.attempts.get(kind)! };
    const id = randomUUID();
    let reference: { backend: Artifact['backend']; key: string } | null = null;
    try {
      // ほかの新しいArtifactと同じく、Projectの今の保存先に置く。無効な保存先なら失敗して
      // 再試行する。
      const backend = await projectArtifactBackend(database, source.projectId, stores);
      reference = { backend, key: `${source.projectId}/${id}/content` };
      const stored = await stores.put({ ...reference, body: Readable.from(file.body), mimeType: file.mimeType });
      const storedReference = reference;
      await transaction(database, async (connection) => {
        await registerStoredArtifact(
          connection,
          {
            id,
            projectId: source.projectId,
            runId: null,
            path: `.previews/${source.id}/${file.fileName}`,
            backend: storedReference.backend,
            storageKey: storedReference.key,
            mimeType: file.mimeType,
            size: stored.size,
            sha256: stored.sha256,
          },
          { stores },
        );
        if (!(await markPreviewReady(connection, { ...outcome, previewArtifactId: id })))
          throw new PreviewClaimLostError();
      });
    } catch (error) {
      if (reference) await stores.remove(reference).catch(() => logPreviewEvent('artifact_cleanup_failed', { artifactId: id }));
      if (error instanceof PreviewClaimLostError) return;
      logPreviewEvent('artifact_preview_store_failed', { artifactId: source.id, kind, name: (error as Error).name });
      await retryPreviewLater(database, { ...outcome, error: 'storage_failed' });
    }
  }

  private finishAll(job: PreviewJob, failure: PreviewFailure): Promise<void> {
    return this.finishKinds(job, [...job.attempts.keys()], failure);
  }

  private async finishKinds(job: PreviewJob, kinds: ArtifactPreviewKind[], failure: PreviewFailure): Promise<void> {
    for (const kind of kinds)
      await markPreviewFinished(this.options.database, {
        artifactId: job.artifact.id,
        kind,
        attempts: job.attempts.get(kind)!,
        ...failure,
      });
  }
}
