export const MIN_BPM = 30;
export const MAX_BPM = 300;

export function clampBpm(bpm: number) {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

/** 두 번 두드린 간격이 이보다 길면 새로 세기 시작한다. */
const TAP_RESET_MS = 2000;

/**
 * 탭 템포: 최근 탭 간격의 중앙값으로 BPM 을 구한다(한 번 삐끗한 탭에 흔들리지 않게).
 * taps 는 오래된 순서의 타임스탬프(ms). 2번 미만이면 null.
 */
export function tapTempo(taps: number[]): number | null {
  const recent: number[] = [];
  for (let i = taps.length - 1; i > 0 && recent.length < 6; i--) {
    const gap = taps[i] - taps[i - 1];
    if (gap > TAP_RESET_MS || gap <= 0) break;
    recent.push(gap);
  }
  if (!recent.length) return null;
  recent.sort((a, b) => a - b);
  const mid = recent[Math.floor(recent.length / 2)];
  return clampBpm(60000 / mid);
}

/** 오래 쉬었으면 새로 세고, 최근 8번만 남긴다 */
export function pushTap(taps: number[], t: number) {
  const last = taps[taps.length - 1];
  const next = last != null && t - last > TAP_RESET_MS ? [t] : [...taps, t];
  return next.slice(-8);
}
