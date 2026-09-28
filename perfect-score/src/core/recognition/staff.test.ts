import { describe, expect, it } from 'vitest';
import { detectStaves, findStaff, snapToStaff } from './staff';
import { placeGlyph } from './placement';
import type { Recognition } from './recognizer';

/** 흰 바탕에 오선 두 개(칸 10px, 줄 두께 2px)를 그린 1000x600 이미지 */
function fakePage() {
  const width = 1000, height = 600;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const hline = (y: number, x0 = 50, x1 = 950) => {
    for (let t = 0; t < 2; t++) for (let x = x0; x < x1; x++) { const i = ((y + t) * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; }
  };
  for (const top of [100, 300]) for (let k = 0; k < 5; k++) hline(top + k * 10);
  // 오선이 아닌 가로줄(제목 밑줄) 하나
  hline(40, 300, 700);
  return { width, height, data };
}

describe('detectStaves', () => {
  it('5줄 오선을 찾고 칸 크기를 구한다', () => {
    const map = detectStaves(fakePage());
    const staves = map.bands[2].staves;
    expect(staves).toHaveLength(2);
    expect(staves[0].top).toBeCloseTo(100.5 / 1000, 4);
    expect(staves[0].space).toBeCloseTo(10 / 1000, 4);
  });

  it('가까운 오선을 고르고 줄/칸에 스냅한다', () => {
    const map = detectStaves(fakePage());
    const s = findStaff(map, 0.5, 0.31)!;
    expect(s.top).toBeCloseTo(0.3005, 4);
    expect(findStaff(map, 0.5, 0.2)).toBeNull(); // 두 오선 사이 먼 곳
    expect(snapToStaff(0.3005 + 0.0122, s)).toBeCloseTo(0.3005 + 0.01, 4); // 둘째 줄
  });
});

describe('placeGlyph', () => {
  const metrics = () => ({ left: 0, right: 0.3, top: -0.1, bottom: 0.1 });
  const staff = { top: 0.3, space: 0.01 };
  const rec = (patch: Partial<Recognition>): Recognition => ({
    glyph: 'noteQuarterUp', name: '', anchor: 'headBottom', score: 1, staffSpace: 0.012,
    bbox: { minX: 0.5, minY: 0.27, maxX: 0.51, maxY: 0.3265 }, ...patch,
  });

  it('줄기 위 음표는 머리를 줄/칸에 스냅하고 크기를 오선에 맞춘다', () => {
    const p = placeGlyph(rec({}), staff, metrics);
    expect(p.size).toBeCloseTo(0.04);
    expect(p.y).toBeCloseTo(0.32); // 0.3215 → 셋째 줄(0.32)
    expect(p.x).toBe(0.5);
  });

  it('오선이 없으면 그린 크기로 추정한 칸을 쓴다', () => {
    expect(placeGlyph(rec({}), null, metrics).size).toBeCloseTo(0.048);
  });
});
