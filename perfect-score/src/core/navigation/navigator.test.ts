import { describe, expect, it } from 'vitest';
import { anchorPage, convertStep, describeView, maxStep, nextStep, pageToStep, stepToView, visiblePages } from './navigator';

describe('single layout', () => {
  it('instant 모드는 한 페이지씩 넘긴다', () => {
    let k = 0;
    const pages: number[] = [];
    for (let i = 0; i < 5; i++) {
      pages.push(anchorPage(stepToView(k, 4, 'single')));
      k = nextStep(k, 1, 'instant', 4, 'single');
    }
    expect(pages).toEqual([1, 2, 3, 4, 4]);
  });

  it('half 모드는 윗부분을 먼저 다음 페이지로 바꾼다', () => {
    const seq = [0, 1, 2, 3].map((k) => stepToView(k, 3, 'single'));
    expect(seq).toEqual([
      { layout: 'single', kind: 'full', page: 1 },
      { layout: 'single', kind: 'half', top: 2, bottom: 1 },
      { layout: 'single', kind: 'full', page: 2 },
      { layout: 'single', kind: 'half', top: 3, bottom: 2 },
    ]);
    expect(nextStep(1, 1, 'half', 3, 'single')).toBe(2);
    expect(nextStep(4, 1, 'half', 3, 'single')).toBe(4); // 마지막 페이지에서 멈춤
    expect(nextStep(0, -1, 'half', 3, 'single')).toBe(0);
  });

  it('반 넘김 상태에서 instant 로 넘기면 가까운 온전한 페이지로 간다', () => {
    expect(nextStep(1, 1, 'instant', 5, 'single')).toBe(2);
    expect(nextStep(1, -1, 'instant', 5, 'single')).toBe(0);
  });

  it('1페이지짜리 악보', () => {
    expect(maxStep(1, 'single')).toBe(0);
    expect(nextStep(0, 1, 'half', 1, 'single')).toBe(0);
  });
});

describe('double layout', () => {
  it('instant 모드는 펼침면 단위로 넘긴다', () => {
    expect(stepToView(0, 5, 'double')).toMatchObject({ left: 1, right: 2 });
    expect(stepToView(2, 5, 'double')).toMatchObject({ left: 3, right: 4 });
    expect(stepToView(4, 5, 'double')).toMatchObject({ left: 5, right: null });
    expect(maxStep(5, 'double')).toBe(4);
  });

  it('half 모드는 이미 연주한 왼쪽 페이지를 먼저 바꾼다: [1|2] → [3|2] → [3|4]', () => {
    const seq = [0, 1, 2].map((k) => visiblePages(stepToView(k, 4, 'double')));
    expect(seq).toEqual([[1, 2], [3, 2], [3, 4]]);
    expect(maxStep(4, 'double')).toBe(2);
  });

  it('홀수 페이지 악보의 마지막 반 넘김', () => {
    expect(visiblePages(stepToView(3, 5, 'double'))).toEqual([5, 4]);
  });
});

describe('conversion', () => {
  it('회전으로 레이아웃이 바뀌어도 보던 페이지를 유지한다', () => {
    expect(convertStep(pageToStep(4, 6, 'single'), 6, 'single', 'double')).toBe(2); // [3|4]
    expect(anchorPage(stepToView(convertStep(2, 6, 'double', 'single'), 6, 'single'))).toBe(3);
    // 반 넘김 중(3쪽 아래 연주 중)이면 3쪽을 기준으로
    expect(convertStep(5, 6, 'single', 'double')).toBe(2);
  });

  it('describeView', () => {
    expect(describeView(stepToView(1, 3, 'single'), 3)).toBe('1 → 2 / 3');
    expect(describeView(stepToView(0, 3, 'double'), 3)).toBe('1–2 / 3');
  });
});
