import { useCallback, useEffect, useEffectEvent, useState } from 'react';

export interface LoopRange {
  startSeconds: number;
  endSeconds: number;
}

// ページの<audio>要素の再生位置を動かす。React stateではなくDOMのオブジェクトなので、その場で
// 書き換える。
function moveAudioPlayhead(audio: HTMLAudioElement, seconds: number) {
  audio.currentTime = seconds;
}

/**
 * 再生中は<audio>要素の位置をアニメーションのフレームごとに追い（timeupdateは1秒に4回ほどしか
 * 起きず、再生位置の表示には粗すぎる）、再生をループの範囲の中に保つ。
 */
export function useAudioPlayback(audio: HTMLAudioElement | null, loop: LoopRange | null) {
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  // フレームごとに、最新のレンダリングのループ範囲を読む。
  const keepInsideLoop = useEffectEvent((element: HTMLAudioElement) => {
    if (loop && element.currentTime >= loop.endSeconds) moveAudioPlayhead(element, loop.startSeconds);
  });

  useEffect(() => {
    if (!audio) return;
    let frame = 0;
    const tick = () => {
      keepInsideLoop(audio);
      setCurrentTime(audio.currentTime);
      frame = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const onStop = () => {
      setPlaying(false);
      cancelAnimationFrame(frame);
      setCurrentTime(audio.currentTime);
    };
    const onSeeked = () => setCurrentTime(audio.currentTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onStop);
    audio.addEventListener('ended', onStop);
    audio.addEventListener('seeked', onSeeked);
    return () => {
      cancelAnimationFrame(frame);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onStop);
      audio.removeEventListener('ended', onStop);
      audio.removeEventListener('seeked', onSeeked);
    };
  }, [audio]);

  const seek = useCallback(
    (seconds: number) => {
      if (!audio) return;
      moveAudioPlayhead(audio, Math.max(0, seconds));
      setCurrentTime(audio.currentTime);
    },
    [audio],
  );
  const togglePlayback = useCallback(() => {
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, [audio]);
  return { currentTime, playing, seek, togglePlayback };
}
