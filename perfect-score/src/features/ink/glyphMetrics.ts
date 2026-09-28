import { chordSymbolParts, MUSIC_FONT_FAMILY, SMUFL, type SmuflGlyph } from '@/lib/smufl';
import type { GlyphBounds } from '@/core/recognition/placement';

const REF = 100;
const cache = new Map<SmuflGlyph, GlyphBounds>();
let ctx: CanvasRenderingContext2D | null = null;

function measureCtx() {
  ctx ??= document.createElement('canvas').getContext('2d')!;
  return ctx;
}

/** 글자 크기 1 기준 SMuFL 글리프 잉크 경계 (Bravura 가 로드된 뒤 정확) */
export function glyphBounds(glyph: SmuflGlyph): GlyphBounds {
  const hit = cache.get(glyph);
  if (hit) return hit;
  const c = measureCtx();
  c.font = `${REF}px ${MUSIC_FONT_FAMILY}`;
  const m = c.measureText(SMUFL[glyph]);
  const b: GlyphBounds = Number.isFinite(m.actualBoundingBoxAscent)
    ? { left: -m.actualBoundingBoxLeft / REF, right: m.actualBoundingBoxRight / REF, top: -m.actualBoundingBoxAscent / REF, bottom: m.actualBoundingBoxDescent / REF }
    : { left: 0, right: 0.3, top: -0.3, bottom: 0.3 };
  if (document.fonts?.check(`${REF}px ${MUSIC_FONT_FAMILY}`, SMUFL[glyph])) cache.set(glyph, b);
  return b;
}

// ---- 코드 네임(텍스트) 배치 ----

export const TEXT_FONT = "600 {px}px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Apple SD Gothic Neo', sans-serif";
/** 임시표 글리프를 대문자 높이 가운데로 올리는 비율 */
const ACCIDENTAL_RAISE = 0.3;

export interface TextRun { text: string; glyph: boolean; x: number; dy: number; font: string }

/** 텍스트를 글자/임시표 조각으로 나누고 px 단위 위치를 계산한다. */
export function layoutChordText(text: string, px: number): { runs: TextRun[]; width: number } {
  const c = measureCtx();
  let x = 0;
  const runs: TextRun[] = [];
  for (const part of chordSymbolParts(text)) {
    const font = part.glyph ? `${px}px ${MUSIC_FONT_FAMILY}` : TEXT_FONT.replace('{px}', String(px));
    c.font = font;
    runs.push({ text: part.text, glyph: part.glyph, x, dy: part.glyph ? -ACCIDENTAL_RAISE * px : 0, font });
    x += c.measureText(part.text).width + (part.glyph ? px * 0.04 : 0);
  }
  return { runs, width: x };
}

/** 텍스트 아이템의 경계(u) */
export function textBounds(text: string, size: number) {
  const { width } = layoutChordText(text, REF);
  return { left: 0, right: (width / REF) * size, top: -0.78 * size, bottom: 0.22 * size };
}
