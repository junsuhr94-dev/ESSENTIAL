import { strokePoints, type BBox } from '@/core/ink/geometry';
import { recognize, DEFAULT_STAFF_SPACE } from '@/core/recognition/recognizer';
import { placeGlyph } from '@/core/recognition/placement';
import { detectStaves, findStaff, type Staff, type StaffMap } from '@/core/recognition/staff';
import { newId } from '@/lib/utils';
import { useInk } from '@/stores/ink';
import { toast } from '@/stores/toast';
import { glyphBounds } from './glyphMetrics';

const staffCache = new WeakMap<HTMLCanvasElement, StaffMap | null>();

/** 렌더링된 페이지 캔버스에서 오선 지도를 만든다(캔버스마다 한 번). */
export function staffMapFor(raster: HTMLCanvasElement | null | undefined): StaffMap | null {
  if (!raster || !raster.width) return null;
  if (staffCache.has(raster)) return staffCache.get(raster)!;
  let map: StaffMap | null = null;
  try {
    const ctx = raster.getContext('2d');
    if (ctx) map = detectStaves(ctx.getImageData(0, 0, raster.width, raster.height));
  } catch (err) {
    console.warn('staff detection failed', err);
  }
  staffCache.set(raster, map);
  return map;
}

export function staffNear(raster: HTMLCanvasElement | null | undefined, x: number, y: number): Staff | null {
  return findStaff(staffMapFor(raster), x, y);
}

/** 연속 획을 한 기호로 묶는 거리(u) */
export function groupingRadius(raster: HTMLCanvasElement | null | undefined, bbox: BBox) {
  const s = staffNear(raster, (bbox.minX + bbox.maxX) / 2, (bbox.minY + bbox.maxY) / 2)?.space ?? DEFAULT_STAFF_SPACE;
  return 2.5 * s;
}

/**
 * 방금 그린 획 묶음을 음악 기호로 인식해, 성공하면 손글씨 획을 SMuFL 글리프로 바꾼다.
 * 한 번의 실행 취소로 손글씨로 되돌릴 수 있다.
 */
export function tryConvert(page: number, strokeIds: string[], raster: HTMLCanvasElement | null | undefined) {
  const ink = useInk.getState().pages[page];
  if (!ink) return;
  const ids = new Set(strokeIds);
  const strokes = ink.strokes.filter((s) => ids.has(s.id));
  // 그 사이 지우거나 실행 취소한 획이 있으면 변환하지 않는다.
  if (strokes.length !== ids.size) return;

  const pts = strokes.map(strokePoints);
  const flat = pts.flat();
  const cx = flat.reduce((a, p) => a + p.x, 0) / flat.length;
  const cy = flat.reduce((a, p) => a + p.y, 0) / flat.length;
  const staff = staffNear(raster, cx, cy);
  const rec = recognize(pts, { staffSpace: staff?.space });
  if (!rec) return;

  const place = placeGlyph(rec, staff, glyphBounds);
  useInk.getState().commit(page, (cur) => ({
    ...cur,
    strokes: cur.strokes.filter((s) => !ids.has(s.id)),
    symbols: [...cur.symbols, { id: newId(), glyph: rec.glyph, x: place.x, y: place.y, size: place.size, color: strokes[0].color }],
  }));
  toast(`✓ ${rec.name}`, 900);
}
