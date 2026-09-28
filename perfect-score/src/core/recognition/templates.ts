import type { SmuflGlyph } from '@/lib/smufl';

/**
 * 손글씨 음악 기호 템플릿.
 * 단위: 오선 한 칸(staff space) = 1, y 는 아래쪽이 +.
 * 같은 기호도 사람마다 그리는 방식이 달라 변형(variants)을 여러 개 둔다.
 * 새 기호를 추가하려면 SYMBOL_CLASSES 에 항목을 추가하면 된다.
 */

export type Pt = { x: number; y: number };
export type Drawing = Pt[][];

/** 인식 결과를 글리프로 배치하는 기준 */
export type Anchor =
  | 'center' //         그린 모양의 중심 = 글리프 중심
  | 'headBottom' //     줄기 위 음표: 음표 머리가 아래쪽
  | 'headTop'; //       줄기 아래 음표: 음표 머리가 위쪽

export interface SymbolClass {
  name: string;
  glyph: SmuflGlyph;
  anchor: Anchor;
  /** 입력 획 수 허용 범위 */
  strokes: [number, number];
  variants: Drawing[];
}

// ---- 도형 빌더 ----

function line(x1: number, y1: number, x2: number, y2: number, n = 10): Pt[] {
  return Array.from({ length: n }, (_, i) => ({ x: x1 + ((x2 - x1) * i) / (n - 1), y: y1 + ((y2 - y1) * i) / (n - 1) }));
}

function poly(...pts: [number, number][]): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i < pts.length; i++) {
    const seg = line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 8);
    out.push(...(i === 1 ? seg : seg.slice(1)));
  }
  return out;
}

function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 24, tilt = -0.35): Pt[] {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    const x = rx * Math.cos(a), y = ry * Math.sin(a);
    return { x: cx + x * c - y * s, y: cy + x * s + y * c };
  });
}

const TAU = Math.PI * 2;

function dot(cx: number, cy: number, r = 0.22): Pt[] {
  return arc(cx, cy, r, r, 0, TAU, 8, 0);
}

/** 까맣게 칠한 음표 머리 — 나선형으로 칠하기 */
function filledHeadSpiral(cx: number, cy: number): Pt[] {
  return [...arc(cx, cy, 0.66, 0.48, 0, TAU), ...arc(cx, cy, 0.42, 0.28, 0, TAU, 16), ...arc(cx, cy, 0.16, 0.1, 0, TAU, 8)];
}

/** 까맣게 칠한 음표 머리 — 지그재그로 칠하기 */
function filledHeadZigzag(cx: number, cy: number): Pt[] {
  return [...arc(cx, cy, 0.66, 0.48, 0, TAU), ...poly([cx - 0.5, cy + 0.2], [cx + 0.3, cy - 0.4], [cx - 0.3, cy + 0.35], [cx + 0.5, cy - 0.2], [cx - 0.1, cy + 0.3])];
}

const openHead = (cx: number, cy: number) => arc(cx, cy, 0.66, 0.48, 0, TAU);

// 줄기: 머리 오른쪽에서 위로 / 왼쪽에서 아래로 (3.5칸)
const stemUp = (cx: number, cy: number) => line(cx + 0.62, cy, cx + 0.62, cy - 3.4);
const stemDown = (cx: number, cy: number) => line(cx - 0.62, cy, cx - 0.62, cy + 3.4);
const flagUp = (cx: number, cy: number) => poly([cx + 0.62, cy - 3.4], [cx + 1.1, cy - 2.6], [cx + 1.55, cy - 1.9], [cx + 1.4, cy - 1.1]);
const flagDown = (cx: number, cy: number) => poly([cx - 0.62, cy + 3.4], [cx - 0.1, cy + 2.6], [cx + 0.35, cy + 1.9], [cx + 0.2, cy + 1.1]);

// ---- 기호 정의 ----

export const SYMBOL_CLASSES: SymbolClass[] = [
  {
    name: '4분음표(줄기 위)',
    glyph: 'noteQuarterUp',
    anchor: 'headBottom',
    strokes: [1, 3],
    variants: [
      [filledHeadSpiral(0, 0), stemUp(0, 0)],
      [filledHeadZigzag(0, 0), stemUp(0, 0)],
    ],
  },
  {
    name: '4분음표(줄기 아래)',
    glyph: 'noteQuarterDown',
    anchor: 'headTop',
    strokes: [1, 3],
    variants: [
      [filledHeadSpiral(0, 0), stemDown(0, 0)],
      [filledHeadZigzag(0, 0), stemDown(0, 0)],
    ],
  },
  {
    name: '2분음표(줄기 위)',
    glyph: 'noteHalfUp',
    anchor: 'headBottom',
    strokes: [1, 2],
    variants: [[openHead(0, 0), stemUp(0, 0)]],
  },
  {
    name: '2분음표(줄기 아래)',
    glyph: 'noteHalfDown',
    anchor: 'headTop',
    strokes: [1, 2],
    variants: [[openHead(0, 0), stemDown(0, 0)]],
  },
  {
    name: '8분음표(줄기 위)',
    glyph: 'note8thUp',
    anchor: 'headBottom',
    strokes: [1, 3],
    variants: [
      [filledHeadSpiral(0, 0), stemUp(0, 0), flagUp(0, 0)],
      [filledHeadZigzag(0, 0), [...stemUp(0, 0), ...flagUp(0, 0)]],
    ],
  },
  {
    name: '8분음표(줄기 아래)',
    glyph: 'note8thDown',
    anchor: 'headTop',
    strokes: [1, 3],
    variants: [
      [filledHeadSpiral(0, 0), stemDown(0, 0), flagDown(0, 0)],
      [filledHeadZigzag(0, 0), [...stemDown(0, 0), ...flagDown(0, 0)]],
    ],
  },
  {
    name: '음표 머리',
    glyph: 'noteheadBlack',
    anchor: 'center',
    strokes: [1, 2],
    variants: [[filledHeadSpiral(0, 0)], [filledHeadZigzag(0, 0)]],
  },
  {
    name: '온음표',
    glyph: 'noteWhole',
    anchor: 'center',
    strokes: [1, 1],
    variants: [[openHead(0, 0)]],
  },
  {
    name: '4분쉼표',
    glyph: 'restQuarter',
    anchor: 'center',
    strokes: [1, 2],
    variants: [[poly([0.1, -1.5], [0.8, -0.5], [0.2, 0.3], [0.9, 1.0], [0.2, 0.9], [0.5, 1.6])]],
  },
  {
    name: '8분쉼표',
    glyph: 'rest8th',
    anchor: 'center',
    strokes: [1, 3],
    variants: [
      [dot(0.05, -0.55, 0.28), poly([0.2, -0.35], [0.95, -0.7], [0.3, 1.2])],
      [[...dot(0.05, -0.55, 0.28), ...poly([0.2, -0.35], [0.95, -0.7], [0.3, 1.2])]],
    ],
  },
  {
    name: '샵(#)',
    glyph: 'accidentalSharp',
    anchor: 'center',
    strokes: [2, 4],
    variants: [
      [line(-0.4, -1.3, -0.4, 1.6), line(0.4, -1.6, 0.4, 1.3), line(-0.9, -0.35, 0.9, -0.75), line(-0.9, 0.75, 0.9, 0.35)],
      [line(-0.35, -1.4, -0.45, 1.5), line(0.45, -1.5, 0.35, 1.4), line(-0.9, -0.5, 0.9, -0.5), line(-0.9, 0.5, 0.9, 0.5)],
    ],
  },
  {
    name: '플랫(b)',
    glyph: 'accidentalFlat',
    anchor: 'center',
    strokes: [1, 2],
    variants: [
      [poly([0, -2.2], [0, 1]), poly([0, 0.2], [0.45, -0.05], [0.8, 0.1], [0.75, 0.5], [0, 1])],
      [poly([0, -2.2], [0, 1], [0.1, 0.1], [0.6, -0.05], [0.85, 0.3], [0.5, 0.75], [0, 1])],
    ],
  },
  {
    name: '내추럴',
    glyph: 'accidentalNatural',
    anchor: 'center',
    strokes: [1, 2],
    variants: [
      [poly([-0.4, -1.6], [-0.4, 0.6], [0.4, 0.3]), poly([-0.4, -0.3], [0.4, -0.6], [0.4, 1.6])],
      [poly([-0.4, -1.6], [-0.4, 0.6], [0.4, 0.3], [0.4, 1.6]), line(-0.4, -0.3, 0.4, -0.6)],
    ],
  },
  {
    name: '악센트(>)',
    glyph: 'articAccentAbove',
    anchor: 'center',
    strokes: [1, 1],
    variants: [[poly([-0.8, -0.45], [0.8, 0], [-0.8, 0.45])]],
  },
  {
    name: '페르마타',
    glyph: 'fermataAbove',
    anchor: 'center',
    strokes: [2, 3],
    variants: [[arc(0, 0.2, 1.3, 1.1, Math.PI, TAU, 20, 0), dot(0, -0.1, 0.2)]],
  },
  {
    name: 'X 음표 머리',
    glyph: 'noteheadXBlack',
    anchor: 'center',
    strokes: [2, 2],
    variants: [[line(-0.55, -0.55, 0.55, 0.55), line(0.55, -0.55, -0.55, 0.55)]],
  },
  {
    name: '도돌이표 시작(||:)',
    glyph: 'repeatLeft',
    anchor: 'center',
    strokes: [3, 5],
    variants: [
      [line(-0.9, -2, -0.9, 2), line(-0.3, -2, -0.3, 2), dot(0.4, -0.5), dot(0.4, 0.5)],
      [line(-0.6, -2, -0.6, 2), dot(0.2, -0.5), dot(0.2, 0.5)],
    ],
  },
  {
    name: '도돌이표 끝(:||)',
    glyph: 'repeatRight',
    anchor: 'center',
    strokes: [3, 5],
    variants: [
      [line(0.9, -2, 0.9, 2), line(0.3, -2, 0.3, 2), dot(-0.4, -0.5), dot(-0.4, 0.5)],
      [line(0.6, -2, 0.6, 2), dot(-0.2, -0.5), dot(-0.2, 0.5)],
    ],
  },
  {
    name: '코다',
    glyph: 'coda',
    anchor: 'center',
    strokes: [2, 3],
    variants: [[arc(0, 0, 1, 1.1, 0, TAU, 24, 0), line(0, -1.7, 0, 1.7), line(-1.6, 0, 1.6, 0)]],
  },
  {
    name: '페달(Ped.)',
    glyph: 'keyboardPedalPed',
    anchor: 'center',
    strokes: [1, 2],
    variants: [
      [poly([0, 1.5], [0, -1.1]), poly([0, -1.1], [0.7, -1.05], [0.95, -0.6], [0.7, -0.15], [0, -0.1])],
      [poly([0, 1.5], [0, -1.1], [0.7, -1.05], [0.95, -0.6], [0.7, -0.15], [0, -0.1])],
    ],
  },
  {
    name: '페달 떼기(*)',
    glyph: 'keyboardPedalUp',
    anchor: 'center',
    strokes: [3, 4],
    variants: [[line(-0.8, 0, 0.8, 0), line(-0.4, -0.7, 0.4, 0.7), line(0.4, -0.7, -0.4, 0.7)]],
  },
];

/** 템플릿의 크기(칸 단위) — 오선을 못 찾았을 때 그린 크기로 칸 크기를 추정하는 데 쓴다. */
export function templateExtent(d: Drawing) {
  const pts = d.flat();
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
