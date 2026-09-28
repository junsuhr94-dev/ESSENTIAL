/**
 * $P Point-Cloud Recognizer
 *   Vatavu, R.-D., Anthony, L., Wobbrock, J.O. (2012). "Gestures as Point Clouds: A $P Recognizer
 *   for User Interface Prototypes." ICMI '12.
 *
 * 획 순서·방향·획 수와 무관하게 "점들의 모양"으로 비교하므로
 * 사람마다 다르게 그리는 음악 기호(#, b, 음표 등) 인식에 적합하다.
 * 회전은 구분한다(위로 향한 줄기 ≠ 아래로 향한 줄기).
 */

export interface CloudPoint { x: number; y: number; id: number }

export const NUM_POINTS = 32;

export function resample(points: CloudPoint[], n = NUM_POINTS): CloudPoint[] {
  const I = pathLength(points) / (n - 1);
  if (I === 0) return Array.from({ length: n }, () => ({ ...points[0] }));
  let D = 0;
  const src = points.map((p) => ({ ...p }));
  const out: CloudPoint[] = [{ ...src[0] }];
  for (let i = 1; i < src.length; i++) {
    if (src[i].id !== src[i - 1].id) continue;
    const d = dist(src[i - 1], src[i]);
    if (D + d >= I) {
      const t = (I - D) / d;
      const q = { x: src[i - 1].x + t * (src[i].x - src[i - 1].x), y: src[i - 1].y + t * (src[i].y - src[i - 1].y), id: src[i].id };
      out.push(q);
      src.splice(i, 0, q);
      D = 0;
    } else {
      D += d;
    }
  }
  while (out.length < n) out.push({ ...src[src.length - 1] });
  return out.slice(0, n);
}

export function normalize(points: CloudPoint[]): CloudPoint[] {
  const pts = resample(points);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const size = Math.max(maxX - minX, maxY - minY) || 1;
  const scaled = pts.map((p) => ({ x: (p.x - minX) / size, y: (p.y - minY) / size, id: p.id }));
  const cx = scaled.reduce((a, p) => a + p.x, 0) / scaled.length;
  const cy = scaled.reduce((a, p) => a + p.y, 0) / scaled.length;
  return scaled.map((p) => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
}

export function greedyCloudMatch(a: CloudPoint[], b: CloudPoint[]) {
  const n = a.length;
  const step = Math.floor(Math.pow(n, 1 - 0.5));
  let min = Infinity;
  for (let i = 0; i < n; i += step) {
    min = Math.min(min, cloudDistance(a, b, i), cloudDistance(b, a, i));
  }
  return min;
}

function cloudDistance(a: CloudPoint[], b: CloudPoint[], start: number) {
  const n = a.length;
  const matched = new Array<boolean>(n).fill(false);
  let sum = 0;
  let i = start;
  do {
    let index = -1;
    let min = Infinity;
    for (let j = 0; j < n; j++) {
      if (matched[j]) continue;
      const d = dist(a[i], b[j]);
      if (d < min) { min = d; index = j; }
    }
    matched[index] = true;
    const weight = 1 - ((i - start + n) % n) / n;
    sum += weight * min;
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}

/** 거리(0 이상)를 0~1 점수로 바꾼다. */
export function distanceToScore(d: number) {
  return Math.max((2 - d) / 2, 0);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(points: CloudPoint[]) {
  let d = 0;
  for (let i = 1; i < points.length; i++) if (points[i].id === points[i - 1].id) d += dist(points[i - 1], points[i]);
  return d;
}
