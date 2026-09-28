/**
 * Apple Pencil 사용 중 손바닥이 화면에 닿아 페이지가 넘어가는 것을 막기 위한 공유 상태.
 * 펜 입력이 있으면 기록하고, 그 직후의 손가락 터치는 무시한다.
 */
const PALM_GUARD_MS = 700;
let lastPenAt = -Infinity;
let penDown = false;

export function markPen(timeStamp: number, down?: boolean) {
  lastPenAt = timeStamp;
  if (down !== undefined) penDown = down;
}

export function penRecentlyActive(timeStamp: number) {
  return penDown || timeStamp - lastPenAt < PALM_GUARD_MS;
}
