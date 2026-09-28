/**
 * 렌더링된 악보 이미지에서 오선(5줄)을 찾는다.
 * 인식된 기호의 크기를 실제 오선 칸에 맞추고, 음표·임시표를 줄/칸 위치에 스냅하는 데 쓴다.
 *
 * 방법: 페이지를 세로 띠(band)로 나눠 행마다 어두운 픽셀 비율을 구하고,
 * 비율이 높은 행(가로줄)들 중 간격이 거의 같은 5줄 묶음을 오선으로 본다.
 * 띠로 나누는 이유: 들여쓴 첫 줄·코다 등으로 오선이 페이지 폭 전체에 걸치지 않는 경우가 많아서.
 */

export interface RasterLike {
  width: number;
  height: number;
  /** RGBA */
  data: Uint8ClampedArray | Uint8Array;
}

export interface Staff {
  /** 맨 윗줄 y (u) */
  top: number;
  /** 칸 크기 (u) */
  space: number;
}

export interface StaffMap {
  bands: { x0: number; x1: number; staves: Staff[] }[];
}

const BANDS = 6;
const DARK = 140;
const LINE_RATIO = 0.5;

export function detectStaves(img: RasterLike): StaffMap {
  const { width, height, data } = img;
  const unit = width; // 픽셀 → 페이지 폭 단위
  const bands: StaffMap['bands'] = [];
  const bandW = Math.floor(width / BANDS);

  for (let b = 0; b < BANDS; b++) {
    const x0 = b * bandW;
    const x1 = b === BANDS - 1 ? width : x0 + bandW;
    const lineRows: number[] = [];
    for (let y = 0; y < height; y++) {
      let dark = 0, total = 0;
      const row = y * width * 4;
      for (let x = x0; x < x1; x += 2) {
        const i = row + x * 4;
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum < DARK) dark++;
        total++;
      }
      if (dark / total > LINE_RATIO) lineRows.push(y);
    }
    bands.push({ x0: x0 / unit, x1: x1 / unit, staves: groupStaves(mergeRows(lineRows)).map((s) => ({ top: s.top / unit, space: s.space / unit })) });
  }
  return { bands };
}

/** 연속한 행(두께 있는 줄)을 줄 중심 하나로 합친다. */
function mergeRows(rows: number[]): number[] {
  const out: number[] = [];
  let start = -1, prev = -2;
  for (const r of rows) {
    if (r !== prev + 1) {
      if (start >= 0) out.push((start + prev) / 2);
      start = r;
    }
    prev = r;
  }
  if (start >= 0) out.push((start + prev) / 2);
  return out;
}

/** 간격이 고른 5줄 묶음을 오선으로 */
function groupStaves(lines: number[]): { top: number; space: number }[] {
  const staves: { top: number; space: number }[] = [];
  let i = 0;
  while (i + 4 < lines.length) {
    const gaps = [1, 2, 3, 4].map((k) => lines[i + k] - lines[i + k - 1]);
    const avg = gaps.reduce((a, g) => a + g, 0) / 4;
    if (avg >= 3 && gaps.every((g) => Math.abs(g - avg) <= avg * 0.2)) {
      staves.push({ top: lines[i], space: avg });
      i += 5;
    } else {
      i++;
    }
  }
  return staves;
}

/** (x, y) 근처의 오선. 위아래로 4칸 이내(덧줄 범위)만 인정한다. */
export function findStaff(map: StaffMap | null, x: number, y: number): Staff | null {
  if (!map) return null;
  const band = map.bands.find((b) => x >= b.x0 && x < b.x1) ?? map.bands[map.bands.length - 1];
  const candidates = band?.staves.length ? band.staves : map.bands.flatMap((b) => b.staves);
  let best: Staff | null = null;
  let bestD = Infinity;
  for (const s of candidates) {
    const bottom = s.top + 4 * s.space;
    const d = y < s.top ? s.top - y : y > bottom ? y - bottom : 0;
    if (d <= 4 * s.space && d < bestD) { best = s; bestD = d; }
  }
  return best;
}

/** 줄·칸 위치(반 칸 단위)로 스냅 */
export function snapToStaff(y: number, staff: Staff) {
  const half = staff.space / 2;
  return staff.top + Math.round((y - staff.top) / half) * half;
}
