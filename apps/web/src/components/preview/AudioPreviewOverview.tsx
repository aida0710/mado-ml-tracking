import type { MouseEvent } from 'react';
import { formatAudioTime, fractionOfTime, timeAtFraction } from '../../lib/audioTimeline';
import type { ServerWaveform } from '../../lib/serverAudioPreview';
import { AudioWaveform } from './AudioWaveform';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';
import { artifactsTextTemplates } from '../../i18n/artifacts';

const WAVEFORM_HEIGHT = 88;
const SPECTROGRAM_HEIGHT = 140;
// ナイキスト周波数のラベルは、スペクトログラムの上端のすぐ内側に置く。
const FREQUENCY_LABEL_OFFSET = 6;
const KEYBOARD_SEEK_SECONDS = 1;

/**
 * ブラウザで解析できる上限を超えた音声について、サーバーが作ったファイル全体の波形と
 * スペクトログラム。クリックでシークする。サーバーの画像は解像度が決まっているので、ズームは
 * 無い。シークはクリックを待つので、画像の上をスワイプしてページをスクロールしても位置は
 * 変わらない。
 */
export function AudioPreviewOverview({
  waveform,
  spectrogramUrl,
  currentTime,
  onSeek,
}: {
  waveform: ServerWaveform;
  spectrogramUrl: string | null;
  currentTime: number;
  onSeek: (seconds: number) => void;
}) {
  useLocale();
  const range = { startSeconds: 0, endSeconds: waveform.durationSeconds };
  const seekToPointer = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onSeek(timeAtFraction((event.clientX - box.left) / box.width, range));
  };
  return (
    <>
      <div
        className="audio-timeline"
        role="slider"
        tabIndex={0}
        aria-label={text.audioTimeline}
        aria-valuemin={0}
        aria-valuemax={Math.round(waveform.durationSeconds * 100) / 100}
        aria-valuenow={Math.round(currentTime * 100) / 100}
        aria-valuetext={formatAudioTime(currentTime)}
        onKeyDown={(event) => {
          const step = event.key === 'ArrowRight' ? KEYBOARD_SEEK_SECONDS : event.key === 'ArrowLeft' ? -KEYBOARD_SEEK_SECONDS : 0;
          if (!step) return;
          event.preventDefault();
          onSeek(Math.max(0, Math.min(waveform.durationSeconds, currentTime + step)));
        }}
        onClick={seekToPointer}
      >
        <AudioWaveform peaks={waveform.peaks} height={WAVEFORM_HEIGHT} />
        {spectrogramUrl && (
          <>
            <img src={spectrogramUrl} className="audio-spectrogram" style={{ height: SPECTROGRAM_HEIGHT }} alt="" aria-hidden="true" />
            <span className="audio-frequency-label mono" style={{ top: WAVEFORM_HEIGHT + FREQUENCY_LABEL_OFFSET }}>
              {artifactsTextTemplates.audioMaxFrequency(waveform.sampleRate / 2)}
            </span>
          </>
        )}
        <div className="audio-playhead" style={{ left: `${fractionOfTime(currentTime, range) * 100}%` }} />
      </div>
      <p className="muted audio-hint">{text.audioServerPreviewNote}</p>
    </>
  );
}
