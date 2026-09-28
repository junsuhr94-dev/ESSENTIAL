import type { SmuflGlyph } from '@/lib/smufl';
import { bboxOf, pathLength, type BBox, type Point } from '../ink/geometry';
import { distanceToScore, greedyCloudMatch, normalize, type CloudPoint } from './pdollar';
import { SYMBOL_CLASSES, templateExtent, type Anchor, type Drawing } from './templates';

export interface Recognition {
  glyph: SmuflGlyph;
  name: string;
  anchor: Anchor;
  /** 0~1 */
  score: number;
  bbox: BBox;
  /** 인식에 쓴 칸 크기(u) — 오선에서 찾았거나 그린 크기로 추정 */
  staffSpace: number;
}

export interface RecognizeOptions {
  /** 주변 오선의 칸 크기(u). 모르면 그린 크기로 추정한다. */
  staffSpace?: number;
  /** 이 점수 미만이면 변환하지 않고 손글씨로 둔다. */
  minScore?: number;
}

/** A4 악보의 일반적인 오선 칸(≈1.75mm / 210mm) */
export const DEFAULT_STAFF_SPACE = 0.0085;
// 합성 손글씨 실험: 올바른 기호 최저 0.47, 무작위 획 최고 0.33 → 그 사이로 설정
export const DEFAULT_MIN_SCORE = 0.42;

interface Prepared {
  cls: (typeof SYMBOL_CLASSES)[number];
  cloud: CloudPoint[];
  extent: { w: number; h: number };
}

let prepared: Prepared[] | null = null;
function templates() {
  prepared ??= SYMBOL_CLASSES.flatMap((cls) =>
    cls.variants.map((v) => ({ cls, cloud: normalize(toCloud(v)), extent: templateExtent(v) })),
  );
  return prepared;
}

function toCloud(d: Drawing): CloudPoint[] {
  return d.flatMap((stroke, id) => stroke.map((p) => ({ x: p.x, y: p.y, id })));
}

/** 너무 짧은 획(점)은 경로 길이가 0 이라 $P 재표본화에서 사라지므로 작은 원으로 바꾼다. */
function expandDots(strokes: Point[][], maxDim: number): Point[][] {
  return strokes.map((s) => {
    if (pathLength(s) > maxDim * 0.15) return s;
    const b = bboxOf(s);
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    const r = maxDim * 0.06;
    return Array.from({ length: 8 }, (_, i) => ({ x: cx + r * Math.cos((i / 8) * Math.PI * 2), y: cy + r * Math.sin((i / 8) * Math.PI * 2) }));
  });
}

function straightness(s: Point[]) {
  const len = pathLength(s);
  if (!len) return 0;
  return Math.hypot(s[s.length - 1].x - s[0].x, s[s.length - 1].y - s[0].y) / len;
}

/**
 * 손으로 그린 획 묶음(페이지 폭 단위)을 음악 기호로 인식한다.
 * 확신이 없으면 null — 손글씨를 그대로 둔다(잘못된 변환이 더 거슬리기 때문).
 */
export function recognize(strokes: Point[][], opts: RecognizeOptions = {}): Recognition | null {
  const pts = strokes.flat();
  if (!pts.length) return null;
  const bbox = bboxOf(pts);
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  const maxDim = Math.max(w, h);
  const s = opts.staffSpace ?? DEFAULT_STAFF_SPACE;
  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;
  const result = (glyph: SmuflGlyph, name: string, score: number, staffSpace = s): Recognition => ({ glyph, name, anchor: 'center', score, bbox, staffSpace });

  // 1) 크기·모양 규칙으로 바로 판단되는 기호
  if (maxDim < 0.7 * s) return result('articStaccatoAbove', '스타카토', 1);
  if (maxDim > 9 * s) return null; // 마디를 감싸는 원, 슬러 등 큰 표시는 손글씨로 둔다

  if (strokes.length === 1 && straightness(strokes[0]) > 0.93) {
    const angle = Math.abs(Math.atan2(h, w)); // 0 = 수평, π/2 = 수직
    if (angle < 0.3 && w < 3.5 * s) return result('articTenutoAbove', '테누토', 0.95);
    if (angle > 0.4 && angle < 1.3 && maxDim < 5 * s) {
      const [a, b] = [strokes[0][0], strokes[0][strokes[0].length - 1]];
      // 오른쪽 위로 향하는 사선만 리듬 슬래시로 본다
      if ((b.x - a.x) * (b.y - a.y) < 0) return result('noteheadSlashHorizontalEnds', '리듬 슬래시', 0.95);
    }
    return null; // 줄기·마디줄·밑줄 등
  }

  // 2) $P 점 구름 매칭
  const cloud = normalize(expandDots(strokes, maxDim).flatMap((st, id) => st.map((p) => ({ x: p.x, y: p.y, id }))));
  let best: { t: Prepared; score: number } | null = null;
  for (const t of templates()) {
    const [minS, maxS] = t.cls.strokes;
    if (strokes.length < minS || strokes.length > maxS) continue;
    const score = distanceToScore(greedyCloudMatch(cloud, t.cloud));
    if (!best || score > best.score) best = { t, score };
  }
  if (!best || best.score < minScore) return null;

  const { cls, extent } = best.t;
  // 오선을 모르면 그린 높이/템플릿 높이로 칸 크기를 추정한다.
  const staffSpace = opts.staffSpace ?? (extent.h > 0.5 ? h / extent.h : w / Math.max(extent.w, 0.5));
  const refined = refineHeadFill(cls.glyph, strokes, bbox, staffSpace);
  const name = refined === cls.glyph ? cls.name : (SYMBOL_CLASSES.find((c) => c.glyph === refined)?.name ?? cls.name);
  return { glyph: refined, name, anchor: cls.anchor, score: best.score, bbox, staffSpace };
}

/** 빈 머리 ↔ 칠한 머리 짝 */
const HEAD_PAIRS: Partial<Record<SmuflGlyph, { open: SmuflGlyph; filled: SmuflGlyph; region: 'bottom' | 'top' | 'all' }>> = {
  noteHalfUp: { open: 'noteHalfUp', filled: 'noteQuarterUp', region: 'bottom' },
  noteQuarterUp: { open: 'noteHalfUp', filled: 'noteQuarterUp', region: 'bottom' },
  noteHalfDown: { open: 'noteHalfDown', filled: 'noteQuarterDown', region: 'top' },
  noteQuarterDown: { open: 'noteHalfDown', filled: 'noteQuarterDown', region: 'top' },
  noteWhole: { open: 'noteWhole', filled: 'noteheadBlack', region: 'all' },
  noteheadBlack: { open: 'noteWhole', filled: 'noteheadBlack', region: 'all' },
};

/** 채움 판정 기준: 음표 머리 영역의 잉크 길이 / 머리 둘레 */
export const HEAD_FILL_RATIO = 1.2; // 빈 머리 한 바퀴 ≈ 1.0, 두 바퀴 이상 칠하면 ≥ 1.25

/**
 * 점 구름 모양만으로는 "칠한 머리(4분음표)"와 "빈 머리(2분음표)"가 헷갈리므로,
 * 머리 부분에 그은 잉크 양(둘레 대비 경로 길이)으로 다시 판정한다.
 */
function refineHeadFill(glyph: SmuflGlyph, strokes: Point[][], bbox: BBox, s: number): SmuflGlyph {
  const pair = HEAD_PAIRS[glyph];
  if (!pair) return glyph;
  const bandH = 1.4 * s;
  const inHead = (p: Point) =>
    pair.region === 'all' ? true : pair.region === 'bottom' ? p.y >= bbox.maxY - bandH : p.y <= bbox.minY + bandH;
  // 줄기는 머리 잉크에서 뺀다: 연속된 수직 선분 묶음의 세로 길이가 0.8칸을 넘으면 줄기로 본다.
  // (머리 타원의 양옆도 잠깐 수직이지만 짧다)
  let len = 0;
  for (const st of strokes) {
    let run = 0, runSpan = 0;
    const endRun = () => { if (runSpan <= 0.8 * s) len += run; run = runSpan = 0; };
    for (let i = 1; i < st.length; i++) {
      const a = st[i - 1], b = st[i];
      if (!inHead(a) || !inHead(b)) { endRun(); continue; }
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (Math.abs(b.x - a.x) < 0.25 * Math.abs(b.y - a.y)) {
        run += d;
        runSpan += Math.abs(b.y - a.y);
      } else {
        endRun();
        len += d;
      }
    }
    endRun();
  }
  // 머리 = 가로 약 1.3칸, 세로 약 1칸 타원
  const ra = 0.66 * s, rb = 0.48 * s;
  const perimeter = 2 * Math.PI * Math.sqrt((ra * ra + rb * rb) / 2);
  return len / perimeter > HEAD_FILL_RATIO ? pair.filled : pair.open;
}
