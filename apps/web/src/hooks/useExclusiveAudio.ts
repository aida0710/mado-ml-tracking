import { useCallback, useEffect, useMemo, useRef } from 'react';

export interface ExclusiveAudio {
  /** プレーヤーのidごとの変わらないコールバック。`ref`やAudioArtifactViewerのonAudioElementに使える。 */
  register: (playerId: string) => (element: HTMLAudioElement | null) => void;
  /** プレーヤーのonPlayから呼ぶ。ほかのプレーヤーをすべて一時停止する。 */
  played: (playerId: string) => void;
}

/**
 * 複数の<audio>要素のうち同時に鳴るのを1つだけにし、持ち主がアンマウントされたら（たとえば
 * stepのスライダーで別のstepに移ったとき）すべてを止める。
 */
export function useExclusiveAudio(): ExclusiveAudio {
  const players = useRef(new Map<string, HTMLAudioElement>());
  const registrations = useRef(new Map<string, (element: HTMLAudioElement | null) => void>());

  useEffect(() => {
    const current = players.current;
    return () => {
      for (const player of current.values()) player.pause();
    };
  }, []);

  const register = useCallback((playerId: string) => {
    let registration = registrations.current.get(playerId);
    if (!registration) {
      registration = (element) => {
        if (element) players.current.set(playerId, element);
        else players.current.delete(playerId);
      };
      registrations.current.set(playerId, registration);
    }
    return registration;
  }, []);
  const played = useCallback((playerId: string) => {
    for (const [otherId, player] of players.current) if (otherId !== playerId) player.pause();
  }, []);
  return useMemo(() => ({ register, played }), [register, played]);
}
