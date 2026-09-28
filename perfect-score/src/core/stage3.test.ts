import { describe, expect, it } from 'vitest';
import { detectContentBox, FULL_PAGE } from './render/autoCrop';
import { pushTap, tapTempo } from './metronome/tempo';
import { moveItem, pageForMeasure } from './setlist/setlist';

describe('autoCrop', () => {
  function page(w: number, h: number, ink: [number, number, number, number][]) {
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    for (const [x0, y0, x1, y1] of ink)
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    return { width: w, height: h, data };
  }

  it('잉크 영역 + 여백으로 자른다', () => {
    const box = detectContentBox(page(200, 300, [[20, 30, 180, 32], [20, 250, 180, 270]]), { padding: 0 });
    expect(box).toEqual([0.1, 0.1, 0.9, 0.9]);
  });

  it('빈 페이지나 내용이 아주 작은 페이지는 자르지 않는다', () => {
    expect(detectContentBox(page(100, 100, []))).toEqual(FULL_PAGE);
    expect(detectContentBox(page(100, 100, [[40, 40, 50, 50]]))).toEqual(FULL_PAGE);
  });

  it('먼지 한 점은 무시한다', () => {
    const box = detectContentBox(page(200, 300, [[20, 30, 180, 270], [2, 2, 3, 3]]), { padding: 0 });
    expect(box[0]).toBeCloseTo(0.1);
  });
});

describe('tapTempo', () => {
  it('탭 간격의 중앙값으로 BPM 을 구한다', () => {
    expect(tapTempo([0, 500, 1000, 1500])).toBe(120);
    expect(tapTempo([0, 500, 1000, 1700, 2200])).toBe(120); // 한 번 늦은 탭
    expect(tapTempo([0])).toBeNull();
  });

  it('2초 넘게 쉬면 새로 센다', () => {
    let taps: number[] = [];
    for (const t of [0, 500, 1000, 5000, 5400]) taps = pushTap(taps, t);
    expect(taps).toEqual([5000, 5400]);
    expect(tapTempo(taps)).toBe(150);
  });
});

describe('setlist helpers', () => {
  it('moveItem', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('pageForMeasure', () => {
    const bm = [
      { id: '1', label: 'A', page: 1, measure: 1 },
      { id: '2', label: 'B', page: 2, measure: 17 },
      { id: '3', label: 'C', page: 3, measure: 33 },
      { id: '4', label: '코다', page: 4 },
    ];
    expect(pageForMeasure(bm, 25)?.page).toBe(2);
    expect(pageForMeasure(bm, 33)?.page).toBe(3);
    expect(pageForMeasure(bm, 0)).toBeNull();
  });
});
