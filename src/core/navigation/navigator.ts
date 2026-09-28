/**
 * 페이지 넘김 상태 모델 (순수 함수 — UI와 무관하게 테스트 가능).
 *
 * 모든 화면 상태를 "반 단계(step)" 정수 하나로 표현한다.
 *   - 짝수 step : 온전한 화면 (한 쪽 보기: 한 페이지 / 두 쪽 보기: 펼침면)
 *   - 홀수 step : 반 넘김 상태
 *
 * ▸ Half-Page Turn(한 쪽 보기)
 *     [3쪽 전체] → 페달 → [위: 4쪽 윗부분 / 아래: 3쪽 아랫부분] → 페달 → [4쪽 전체]
 *   3쪽 아랫부분을 연주하는 동안 이미 연주한 윗부분만 다음 페이지로 바뀌므로
 *   시선이 악보 위치를 잃지 않는다.
 *
 * ▸ Half-Page Turn(두 쪽 보기)
 *     [1 | 2] → [3 | 2] → [3 | 4] → [5 | 4] …
 *   오른쪽 페이지를 연주하는 동안 이미 연주한 왼쪽 페이지를 먼저 교체한다.
 *
 * ▸ Instant 모드는 짝수 step 사이를 2씩 이동한다.
 */

export type Layout = 'single' | 'double';
export type PagedTurnMode = 'instant' | 'half';

export type PagedView =
  | { layout: 'single'; kind: 'full'; page: number }
  | { layout: 'single'; kind: 'half'; top: number; bottom: number }
  | { layout: 'double'; kind: 'full' | 'half'; left: number | null; right: number | null };

function spreadCount(pageCount: number) {
  return Math.ceil(pageCount / 2);
}

export function maxStep(pageCount: number, layout: Layout) {
  if (pageCount <= 0) return 0;
  return layout === 'single' ? 2 * (pageCount - 1) : 2 * (spreadCount(pageCount) - 1);
}

export function clampStep(step: number, pageCount: number, layout: Layout) {
  return Math.min(Math.max(0, Math.round(step)), maxStep(pageCount, layout));
}

export function stepToView(step: number, pageCount: number, layout: Layout): PagedView {
  const k = clampStep(step, pageCount, layout);
  const orNull = (p: number) => (p >= 1 && p <= pageCount ? p : null);
  if (layout === 'single') {
    if (k % 2 === 0) return { layout, kind: 'full', page: k / 2 + 1 };
    const bottom = (k - 1) / 2 + 1;
    return { layout, kind: 'half', top: bottom + 1, bottom };
  }
  if (k % 2 === 0) {
    const s = k / 2;
    return { layout, kind: 'full', left: orNull(2 * s + 1), right: orNull(2 * s + 2) };
  }
  const s = (k - 1) / 2;
  return { layout, kind: 'half', left: orNull(2 * s + 3), right: orNull(2 * s + 2) };
}

/** page 가 온전히 보이는 짝수 step */
export function pageToStep(page: number, pageCount: number, layout: Layout) {
  const p = Math.min(Math.max(1, page), Math.max(1, pageCount));
  const step = layout === 'single' ? 2 * (p - 1) : 2 * Math.floor((p - 1) / 2);
  return clampStep(step, pageCount, layout);
}

/** 이어서 연주할 기준 페이지(저장·슬라이더 표시용). 반 넘김 중에는 아직 연주 중인 이전 페이지. */
export function anchorPage(view: PagedView): number {
  if (view.layout === 'single') return view.kind === 'full' ? view.page : view.bottom;
  if (view.kind === 'half') return view.right ?? view.left ?? 1;
  return view.left ?? view.right ?? 1;
}

export function visiblePages(view: PagedView): number[] {
  if (view.layout === 'single') return view.kind === 'full' ? [view.page] : [view.top, view.bottom];
  return [view.left, view.right].filter((p): p is number => p != null);
}

export function nextStep(step: number, dir: 1 | -1, mode: PagedTurnMode, pageCount: number, layout: Layout) {
  let k: number;
  if (mode === 'half') k = step + dir;
  else if (step % 2 !== 0) k = step + dir; // 반 넘김 상태에서 즉시 모드로 바뀐 경우 가까운 온전한 화면으로
  else k = step + 2 * dir;
  return clampStep(k, pageCount, layout);
}

/** 레이아웃이 바뀔 때(기기 회전 등) 현재 보던 페이지를 유지한다. */
export function convertStep(step: number, pageCount: number, from: Layout, to: Layout) {
  if (from === to) return clampStep(step, pageCount, to);
  return pageToStep(anchorPage(stepToView(step, pageCount, from)), pageCount, to);
}

export function describeView(view: PagedView, pageCount: number) {
  if (view.layout === 'single') {
    return view.kind === 'full' ? `${view.page} / ${pageCount}` : `${view.bottom} → ${view.top} / ${pageCount}`;
  }
  const pages = [view.left, view.right].filter((p): p is number => p != null);
  if (view.kind === 'half') return `${view.right} → ${view.left} / ${pageCount}`;
  return `${pages.join('–')} / ${pageCount}`;
}
