import { useEffect } from 'react';

/** 연주 중 화면이 꺼지지 않게 한다(iPadOS 16.4+ / 홈 화면 앱은 18.4+). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (document.visibilityState !== 'visible' || lock) return;
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) { void lock.release(); lock = null; return; }
        lock.addEventListener('release', () => { lock = null; });
      } catch { /* 저전력 모드 등으로 거부될 수 있음 */ }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, [active]);
}
