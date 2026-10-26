import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { fetchResponse } from '@mado/design-system/http';
import { canAnalyzeAudio, type Spectrogram, type WaveformPeaks } from '../lib/audioAnalysis';
import { readAudioSampleRate } from '../lib/audioSampleRate';
import type {
  AudioAnalysisResponse,
  AudioAnalysisView,
} from '../workers/audioAnalysis.worker';

export interface DecodedAudioInfo {
  sampleRate: number;
  /** コンテナのヘッダーを読めず、サンプリングレートがデコーダーの出力のレートのときはfalse。 */
  sampleRateFromFile: boolean;
  channelCount: number;
  durationSeconds: number;
}
export type AudioAnalysisState =
  | { status: 'too_large' }
  | { status: 'loading' }
  | { status: 'error'; reason: 'fetch' | 'decode' | 'analysis' }
  | {
      status: 'ready';
      info: DecodedAudioInfo;
      analysis: { peaks: WaveformPeaks; spectrogram: Spectrogram; view: AudioAnalysisView } | null;
    };

// OfflineAudioContextは3kHz〜768kHzを受け付ける。ヘッダーのそれ以外の値は読めなかったものとする。
const MIN_DECODE_SAMPLE_RATE = 3000;
const MAX_DECODE_SAMPLE_RATE = 768000;

async function fetchArtifactBytes(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  return (await fetchResponse(url, { init: { signal } })).arrayBuffer();
}

async function decodeAudio(bytes: ArrayBuffer): Promise<{ buffer: AudioBuffer; sampleRateFromFile: boolean }> {
  const headerRate = readAudioSampleRate(bytes);
  const usable =
    headerRate !== null && headerRate >= MIN_DECODE_SAMPLE_RATE && headerRate <= MAX_DECODE_SAMPLE_RATE;
  // ファイル自身のレートのcontextにすると、decodeAudioDataはリサンプリングせずにサンプルを返す。
  const context = usable ? new OfflineAudioContext(1, 1, headerRate) : new AudioContext();
  try {
    return { buffer: await context.decodeAudioData(bytes), sampleRateFromFile: usable };
  } finally {
    if (context instanceof AudioContext) void context.close();
  }
}

class StageError extends Error {
  constructor(readonly reason: 'fetch' | 'decode') {
    super(reason);
  }
}

/**
 * 表示中の範囲のために、音声のArtifactを取得・デコード・解析する。AUDIO_ANALYSIS_MAX_BYTESを
 * 超えるファイルはここでは取得しない（lib/audioAnalysis.tsを参照）。ビューアはそれを<audio>で
 * ストリーミングし、代わりにサーバーのプレビュー（useServerAudioPreview）を描く。`view`がnullの
 * 間は、描く幅が分かるまで待つ。
 */
export function useAudioAnalysis({
  url,
  sizeBytes,
  view,
}: {
  url: string;
  sizeBytes: number;
  view: AudioAnalysisView | null;
}): AudioAnalysisState & { retry: () => void } {
  const analyzable = canAnalyzeAudio(sizeBytes);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<AudioAnalysisState>({ status: 'loading' });
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  // 別のファイルや再試行のときは、レンダリング中に読み込みからやり直す。
  const [analyzedFor, setAnalyzedFor] = useState({ url, analyzable, revision });
  if (analyzedFor.url !== url || analyzedFor.analyzable !== analyzable || analyzedFor.revision !== revision) {
    setAnalyzedFor({ url, analyzable, revision });
    setState({ status: 'loading' });
  }

  useEffect(() => {
    if (!analyzable) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const bytes = await fetchArtifactBytes(url, controller.signal).catch((error: unknown) => {
          throw controller.signal.aborted ? error : new StageError('fetch');
        });
        const { buffer, sampleRateFromFile } = await decodeAudio(bytes).catch(() => {
          throw new StageError('decode');
        });
        if (controller.signal.aborted) return;
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
          buffer.getChannelData(index).slice(),
        );
        const worker = new Worker(new URL('../workers/audioAnalysis.worker.ts', import.meta.url), {
          type: 'module',
        });
        worker.postMessage(
          { type: 'load', channels, sampleRate: buffer.sampleRate },
          channels.map((channel) => channel.buffer),
        );
        workerRef.current = worker;
        setState({
          status: 'ready',
          info: {
            sampleRate: buffer.sampleRate,
            sampleRateFromFile,
            channelCount: buffer.numberOfChannels,
            durationSeconds: buffer.duration,
          },
          analysis: null,
        });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({ status: 'error', reason: error instanceof StageError ? error.reason : 'fetch' });
      }
    })();
    return () => {
      controller.abort();
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [url, analyzable, revision]);

  const ready = state.status === 'ready';
  // viewKeyは`view`を表す値。`view`のオブジェクトはレンダリングのたびに別物になる。
  const viewKey = view ? JSON.stringify(view) : null;
  const requestAnalysis = useEffectEvent((worker: Worker) => {
    if (!view) return;
    const requestedView = view;
    // 描くのは最新の要求の結果だけ。古くなった範囲への応答は捨てる。
    const requestId = ++requestIdRef.current;
    const listener = (event: MessageEvent<AudioAnalysisResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId) return;
      setState((previous) => {
        if (previous.status !== 'ready') return previous;
        if ('error' in response) return { status: 'error', reason: 'analysis' };
        return {
          ...previous,
          analysis: { peaks: response.peaks, spectrogram: response.spectrogram, view: requestedView },
        };
      });
    };
    worker.addEventListener('message', listener);
    worker.postMessage({ type: 'analyze', requestId, ...requestedView });
    return () => worker.removeEventListener('message', listener);
  });
  useEffect(() => {
    const worker = workerRef.current;
    if (!ready || !worker || viewKey === null) return;
    return requestAnalysis(worker);
  }, [ready, viewKey]);

  const retry = () => setRevision((value) => value + 1);
  return analyzable ? { ...state, retry } : { status: 'too_large', retry };
}
