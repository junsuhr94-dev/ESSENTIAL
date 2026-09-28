import type { InkStroke } from './types';

export interface Point { x: number; y: number }
export interface BBox { minX: number; minY: number; maxX: number; maxY: number }

export function strokePoints(s: Pick<InkStroke, 'points'>): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < s.points.length; i += 3) out.push({ x: s.points[i], y: s.points[i + 1] });
  return out;
}

export function bboxOf(points: Point[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function strokesBBox(strokes: Pick<InkStroke, 'points'>[]): BBox {
  return bboxOf(strokes.flatMap(strokePoints));
}

export function bboxSize(b: BBox) {
  return { w: b.maxX - b.minX, h: b.maxY - b.minY };
}

export function bboxCenter(b: BBox): Point {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

export function inflate(b: BBox, d: number): BBox {
  return { minX: b.minX - d, minY: b.minY - d, maxX: b.maxX + d, maxY: b.maxY + d };
}

export function intersects(a: BBox, b: BBox) {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

export function pathLength(points: Point[]) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return d;
}

function segDist2(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + t * dx - p.x, y = a.y + t * dy - p.y;
  return x * x + y * y;
}

/** 지우개 원(c, r)에 스트로크가 닿는지 */
export function strokeHit(s: InkStroke, c: Point, r: number) {
  const reach = r + s.width / 2;
  const r2 = reach * reach;
  const p = s.points;
  if (p.length === 3) return (p[0] - c.x) ** 2 + (p[1] - c.y) ** 2 <= r2;
  for (let i = 3; i < p.length; i += 3) {
    if (segDist2(c, { x: p[i - 3], y: p[i - 2] }, { x: p[i], y: p[i + 1] }) <= r2) return true;
  }
  return false;
}

export function pointInBBox(p: Point, b: BBox, pad = 0) {
  return p.x >= b.minX - pad && p.x <= b.maxX + pad && p.y >= b.minY - pad && p.y <= b.maxY + pad;
}

/** 저장 용량을 줄이기 위한 반올림(0.00001u ≈ A4 폭 기준 0.002mm) */
export function roundU(v: number) {
  return Math.round(v * 100000) / 100000;
}
