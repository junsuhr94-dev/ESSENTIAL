import type { SmuflGlyph } from '@/lib/smufl';
import type { Recognition } from './recognizer';
import { snapToStaff, type Staff } from './staff';

/** 글자 크기 1 기준의 글리프 잉크 경계(기준점 원점, y 아래 +) */
export interface GlyphBounds { left: number; right: number; top: number; bottom: number }
export type GlyphMetrics = (glyph: SmuflGlyph) => GlyphBounds;

export interface Placement { x: number; y: number; size: number }

/** 기준점이 음높이(줄/칸)에 놓이는 글리프 — 스냅 대상 */
const PITCHED_CENTER: SmuflGlyph[] = ['noteheadBlack', 'noteWhole', 'noteheadXBlack', 'accidentalSharp', 'accidentalNatural'];
const RESTS: SmuflGlyph[] = ['restQuarter', 'rest8th'];
const REPEATS: SmuflGlyph[] = ['repeatLeft', 'repeatRight'];

/**
 * 인식 결과를 SMuFL 글리프 배치(기준점·크기)로 바꾼다.
 * - 크기: 주변 오선의 칸 크기 × 4 (SMuFL 1em = 오선 높이) → 모든 기호 크기가 악보와 일치
 * - 음표 머리·임시표: 그린 위치에서 가장 가까운 줄/칸으로 스냅
 * - 쉼표: 오선 가운데, 도돌이표: 오선 높이에 맞춤
 */
export function placeGlyph(rec: Recognition, staff: Staff | null, metrics: GlyphMetrics): Placement {
  const s = staff?.space ?? rec.staffSpace;
  const size = 4 * s;
  const { bbox, glyph } = rec;
  const snap = (y: number) => (staff ? snapToStaff(y, staff) : y);
  const m = metrics(glyph);

  if (rec.anchor === 'headBottom') return { x: bbox.minX, y: snap(bbox.maxY - 0.5 * s), size };
  if (rec.anchor === 'headTop') return { x: bbox.minX, y: snap(bbox.minY + 0.5 * s), size };

  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const x = cx - ((m.left + m.right) / 2) * size;

  if (PITCHED_CENTER.includes(glyph)) return { x, y: snap(cy), size };
  // 플랫의 기준점은 둥근 부분(아래쪽)에 있다.
  if (glyph === 'accidentalFlat') return { x, y: snap(bbox.maxY - 0.5 * s), size };
  if (staff && REPEATS.includes(glyph)) return { x, y: staff.top + 4 * staff.space, size };
  if (staff && RESTS.includes(glyph)) {
    const middle = staff.top + 2 * staff.space;
    return { x, y: middle - ((m.top + m.bottom) / 2) * size, size };
  }
  return { x, y: cy - ((m.top + m.bottom) / 2) * size, size };
}
