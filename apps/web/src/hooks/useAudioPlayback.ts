import { useCallback, useEffect, useEffectEvent, useState } from 'react';

export interface LoopRange {
  startSeconds: number;
  endSeconds: number;
}

// Moves the playhead of the page's <audio> element: a DOM object, not React state, so it is
// changed in place.
function moveAudioPlayhead(audio: HTMLAudioElement, seconds: number) {
  audio.currentTime = seconds;
}

/**
 * Follows an <audio> element's position every animation frame while it plays (timeupdate fires only
 * about 4 times a second, too coarse for a playhead) and keeps playback inside the loop range.
 */
export function useAudioPlayback(audio: HTMLAudioElement | null, loop: LoopRange | null) {
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Reads the loop range of the latest render on every frame.
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
